#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file relative to this script's location
loadEnv({ path: join(__dirname, '../../.env') });

// Configuration from environment variables or command line arguments
function getConfig() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const config = {};
    
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        const value = args[i + 1];
        
        switch (key) {
            case '--url':
                config.url = value;
                break;
            case '--token':
                config.token = value;
                break;
            case '--tenant-id':
                config.tenantId = value;
                break;
        }
    }
    
    // Environment variables take precedence if not provided via command line
    const graphqlUrl = config.url || process.env.VELOCITY_GRAPHQL_URL;
    const accessToken = config.token || process.env.VELOCITY_ACCESS_TOKEN;
    const tenantId = config.tenantId || process.env.VELOCITY_TENANT_ID;
    
    console.log('🔍 MCP Config loaded:');
    console.log('  - GraphQL URL:', graphqlUrl ? 'SET' : 'NOT SET');
    console.log('  - Access Token:', accessToken ? 'SET (length: ' + accessToken.length + ')' : 'NOT SET');
    console.log('  - Tenant ID:', tenantId ? 'SET' : 'NOT SET');
    
    // Validate required configuration
    if (!graphqlUrl) {
        throw new Error("GraphQL URL is required. Set VELOCITY_GRAPHQL_URL environment variable or use --url argument.");
    }
    if (!accessToken) {
        throw new Error("Access token is required. Set VELOCITY_ACCESS_TOKEN environment variable or use --token argument.");
    }
    if (!tenantId) {
        throw new Error("Tenant ID is required. Set VELOCITY_TENANT_ID environment variable or use --tenant-id argument.");
    }
    
    return { graphqlUrl, accessToken, tenantId };
}

// Get configuration at startup
const { graphqlUrl, accessToken, tenantId } = getConfig();

// Create an MCP server
const server = new McpServer({
    name: "MCP Velocity GraphQL",
    version: "1.0.0"
});

// Helper function to execute GraphQL queries
async function executeGraphQL(query, variables = {}) {
    console.log('🔍 executeGraphQL called with query:', query.split('\n')[1]?.trim());
    console.log('🔍 Variables:', JSON.stringify(variables));
    console.log('🔍 Access token type:', accessToken.includes('VelocitySession=') ? 'Session Cookie' : 'UserAccessKey');
    
    try {
        // Check if accessToken looks like a cookie string
        const isSessionCookie = accessToken.includes('VelocitySession=') || accessToken.includes('SecurityApiSession=');
        
        let response;
        
        if (isSessionCookie) {
            // Use cookie-based authentication
            response = await attemptGraphQLRequest(query, variables, {
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'User-Agent': 'MCP-Velocity-Client/1.0.0',
                'Cookie': accessToken
            });
        } else {
            // Use UserAccessKey authentication
            response = await attemptGraphQLRequest(query, variables, {
                'Content-Type': 'application/json',
                'Accept': '*/*',
                'User-Agent': 'MCP-Velocity-Client/1.0.0',
                'Authorization': `UserAccessKey ${accessToken}`
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log('🔍 Response data keys:', Object.keys(data));
        console.log('🔍 Data.data keys:', data.data ? Object.keys(data.data) : 'data.data is undefined');
        
        if (data.errors) {
            console.log('🔍 GraphQL errors:', data.errors);
            throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
        }
        
        console.log('🔍 Returning data.data:', !!data.data);
        return data.data;
    } catch (error) {
        console.error('GraphQL execution error:', error);
        throw error;
    }
}

// Helper function to attempt GraphQL request with specific headers
async function attemptGraphQLRequest(query, variables, headers) {
    return await fetch(graphqlUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            query,
            variables
        })
    });
}

// Helper function to extract session cookies from Set-Cookie header
function extractSessionCookies(setCookieHeader) {
    const cookies = [];
    const cookieStrings = setCookieHeader.split(',');
    
    for (const cookieString of cookieStrings) {
        const cookie = cookieString.trim().split(';')[0]; // Get just the name=value part
        if (cookie.includes('VelocitySession=') || cookie.includes('SecurityApiSession=')) {
            cookies.push(cookie);
        }
    }
    
    return cookies.length > 0 ? cookies.join('; ') : null;
}

// Cleanup handler
async function cleanup() {
    process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Release Management Tools

// Tool to get release events
server.tool(
    "get_release_events",
    "Get release events with optional filtering and pagination",
    {
        first: z.number().optional().describe("Number of items to return"),
        dateRange: z.object({
            start: z.string().describe("Start date (ISO string)"),
            end: z.string().describe("End date (ISO string)")
        }).optional().describe("Date range filter"),
        status: z.enum(["DONE", "IN_PROGRESS", "SCHEDULED", "FAILED"]).optional().describe("Filter by status"),
        state: z.enum(["ARCHIVED", "DEFAULT"]).optional().describe("Filter by state")
    },
    async ({ first, dateRange, status, state }) => {
        try {
            const query = `
                query GetReleaseEvents($first: Int, $dateRange: dateRangeInput, $status: ReleaseStatus, $state: ReleaseState) {
                    releaseEventsSearch(
                        first: $first
                        dateRange: $dateRange
                        status: $status
                        state: $state
                    ) {
                        nodes {
                            _id
                            name
                            description
                            start
                            end
                            status
                            state
                            team {
                                id
                                name
                            }
                            tags {
                                _id
                                name
                            }
                            planStats {
                                planCount
                                appCount
                                teamCount
                                taskCount
                                completedTaskCount
                            }
                        }
                        pageInfo {
                            endCursor {
                                key
                                id
                            }
                        }
                    }
                }
            `;

            const variables = {
                first,
                dateRange,
                status,
                state
            };

            const result = await executeGraphQL(query, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Release events retrieved: ${JSON.stringify(result.releaseEventsSearch, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error retrieving release events: ${error.message}` 
                }]
            };
        }
    }
);


// Tool to create a release event
server.tool(
    "create_release_event",
    "Create a new release event",
    {
        name: z.string().describe("Name of the release event"),
        teamId: z.string().describe("Team ID"),
        teamName: z.string().describe("Team name"),
        start: z.string().describe("Start date (ISO string)"),
        end: z.string().describe("End date (ISO string)"),
        description: z.string().optional().describe("Description of the release event"),
        tags: z.array(z.string()).optional().describe("Tag IDs to associate"),
        isEvent: z.boolean().optional().describe("Whether this is an event"),
        summary: z.string().optional().describe("Summary of the release")
    },
    async ({ name, teamId, teamName, start, end, description, tags, isEvent, summary }) => {
        try {
            const mutation = `
                mutation AddReleaseEvent(
                    $name: String!
                    $team: teamInput!
                    $start: Date!
                    $end: Date!
                    $description: String
                    $tags: [ID]
                    $isEvent: Boolean
                    $summary: String
                ) {
                    addReleaseEvent(
                        name: $name
                        team: $team
                        start: $start
                        end: $end
                        description: $description
                        tags: $tags
                        isEvent: $isEvent
                        summary: $summary
                    ) {
                        _id
                        name
                        description
                        start
                        end
                        status
                        team {
                            id
                            name
                        }
                    }
                }
            `;

            const variables = {
                name,
                team: {
                    id: teamId,
                    name: teamName,
                    tenantId: tenantId
                },
                start,
                end,
                description,
                tags,
                isEvent,
                summary
            };

            const result = await executeGraphQL(mutation, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Release event created: ${JSON.stringify(result.addReleaseEvent, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error creating release event: ${error.message}` 
                }]
            };
        }
    }
);

// Pipeline Management Tools

// Tool to get pipelines
server.tool(
    "get_pipelines_by_tenant",
    "Get all pipelines for a tenant",
    {
        tenantId: z.string().optional().describe("Tenant ID (uses configured tenant if not provided)")
    },
    async ({ tenantId: providedTenantId }) => {
        try {
            const query = `
                query GetPipelinesByTenant($tenantId: ID!) {
                    pipelinesByTenantId(tenantId: $tenantId) {
                        _id
                        name
                        description
                        tenant_id
                        synchronize
                        team {
                            id
                            name
                        }
                        stages {
                            _id
                            name
                            type
                            description
                        }
                        applications {
                            _id
                            name
                            type
                            description
                        }
                        stats {
                            leadTime
                        }
                        created
                    }
                }
            `;

            const variables = {
                tenantId: providedTenantId || tenantId
            };

            const result = await executeGraphQL(query, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Pipelines retrieved: ${JSON.stringify(result.pipelinesByTenantId, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error retrieving pipelines: ${error.message}` 
                }]
            };
        }
    }
);

// Tool to create a new pipeline
server.tool(
    "create_pipeline",
    "Create a new pipeline",
    {
        pipelineName: z.string().describe("Name of the pipeline"),
        pipelineDesc: z.string().optional().describe("Description of the pipeline"),
        teamId: z.string().describe("Team ID"),
        teamName: z.string().describe("Team name"),
        defaultEnvironments: z.boolean().optional().describe("Whether to create default environments")
    },
    async ({ pipelineName, pipelineDesc, teamId, teamName, defaultEnvironments }) => {
        try {
            const mutation = `
                mutation ComposeNewPipeline(
                    $pipelineId: ID
                    $pipelineName: String!
                    $pipelineDesc: String!
                    $organizationId: ID!
                    $team: TeamInput!
                    $defaultEnvironments: Boolean
                ) {
                    composeNewPipeline(
                        pipelineId: $pipelineId
                        pipelineName: $pipelineName
                        pipelineDesc: $pipelineDesc
                        organizationId: $organizationId
                        team: $team
                        defaultEnvironments: $defaultEnvironments
                    ) {
                        _id
                        name
                        description
                        team {
                            id
                            name
                        }
                    }
                }
            `;

            // pipelineDesc must be a non-null string
            const variables = {
                pipelineId: null,
                pipelineName,
                pipelineDesc: pipelineDesc || '',
                organizationId: tenantId,
                team: {
                    id: teamId,
                    name: teamName,
                },
                defaultEnvironments: typeof defaultEnvironments === 'boolean' ? defaultEnvironments : null
            };

            const result = await executeGraphQL(mutation, variables);
            return {
                content: [{ 
                    type: 'text', 
                    text: `Pipeline created: ${JSON.stringify(result.composeNewPipeline, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error creating pipeline: ${error.message}` 
                }]
            };
        }
    }
);

// Value Stream Management Tools

// Tool to get workflows (value streams)
server.tool(
    "get_workflows_for_tenant",
    "Get all workflows (value streams) for a tenant",
    {
        tenantId: z.string().optional().describe("Tenant ID (uses configured tenant if not provided)")
    },
    async ({ tenantId: providedTenantId }) => {
        try {
            const query = `
                query GetWorkflowsForTenant($tenantId: ID!) {
                    workflowsForTenant(tenantId: $tenantId) {
                        _id
                        pipelineId
                        name
                        description
                        query
                        phases {
                            name
                            description
                            stages {
                                name
                                description
                                query
                                wipLimit
                                showAlerts
                                showSpeed
                            }
                        }
                        integrations
                        integrationsCount
                        leadTime {
                            start
                            end
                            median
                            firstQuartile
                            thirdQuartile
                        }
                        cycleTime {
                            start
                            end
                            median
                            firstQuartile
                            thirdQuartile
                        }
                        team {
                            id
                            name
                        }
                        created
                        lastUpdate
                    }
                }
            `;

            const variables = {
                tenantId: providedTenantId || tenantId
            };

            const result = await executeGraphQL(query, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Workflows retrieved: ${JSON.stringify(result.workflowsForTenant, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error retrieving workflows: ${error.message}` 
                }]
            };
        }
    }
);

// Tool to get particles in a stage - needs auth fixing
server.tool(
    "get_particles_by_stage",
    "Get particles (work items) in a specific stage of a workflow",
    {
        workflowId: z.string().describe("Workflow ID"),
        stageName: z.string().describe("Stage name"),
        particleIds: z.array(z.string()).optional().describe("Filter by specific particle IDs"),
        skip: z.number().optional().describe("Number of items to skip"),
        limit: z.number().optional().describe("Number of items to return")
    },
    async ({ workflowId, stageName, particleIds, skip, limit }) => {
        try {
            const query = `
                query GetParticlesByStage(
                    $workflowId: ID!
                    $stageName: String!
                    $particleIds: [ID]
                    $pagination: InsightsPaginationInput
                ) {
                    particlesByStage(
                        workflowId: $workflowId
                        stageName: $stageName
                        particleIds: $particleIds
                        pagination: $pagination
                    ) {
                        issue {
                            _id
                            id
                            name
                            status
                            priority
                            type
                            owner
                            creator
                            created
                            lastUpdate
                            url
                            description
                            storyPoints
                            labels
                        }
                        commit {
                            _id
                            id
                            name
                            url
                            creator
                            created
                        }
                        build {
                            _id
                            name
                            status
                            url
                            startTime
                            endTime
                        }
                        deploy {
                            _id
                            name
                            status
                            url
                            startTime
                            endTime
                            environmentId
                        }
                        particleId
                    }
                }
            `;

            const variables = {
                workflowId,
                stageName,
                particleIds,
                pagination: (skip !== undefined || limit !== undefined) ? { skip, limit } : undefined
            };

            const result = await executeGraphQL(query, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Particles retrieved: ${JSON.stringify(result.particlesByStage, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error retrieving particles: ${error.message}` 
                }]
            };
        }
    }
);

// Issue Management Tools

// Tool to get issues
server.tool(
    "get_issues",
    "Get issues with filtering options",
    {
        tenantId: z.string().optional().describe("Tenant ID (uses configured tenant if not provided)"),
        internalIds: z.array(z.string()).optional().describe("Filter by internal IDs"),
        skip: z.number().optional().describe("Number of items to skip"),
        limit: z.number().optional().describe("Number of items to return")
    },
    async ({ tenantId: providedTenantId, internalIds, skip, limit }) => {
        try {
            const query = `
                query GetIssues($filter: IssuesFilter) {
                    issues(filter: $filter) {
                        _id
                        type
                        trackerId
                        tenantId
                        issue {
                            _id
                            id
                            name
                            description
                            status
                            url
                            creator
                            owner
                            created
                            lastUpdate
                            type
                            normalizedType
                            priority
                            storyPoints
                            labels
                            sprints {
                                id
                                name
                                active
                                startTime
                                endTime
                            }
                            releases {
                                id
                                name
                                releaseDate
                                released
                            }
                            project {
                                id
                                key
                                name
                            }
                        }
                    }
                }
            `;

            const variables = {
                filter: {
                    tenantId: providedTenantId || tenantId,
                    internalIds,
                    skip: skip || 0,
                    limit: limit || 100
                }
            };

            const result = await executeGraphQL(query, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Issues retrieved: ${JSON.stringify(result.issues, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error retrieving issues: ${error.message}` 
                }]
            };
        }
    }
);

// Tool to upload issue data
server.tool(
    "upload_issue_data",
    "Upload issue data to Velocity",
    {
        source: z.string().describe("Source system name"),
        trackerId: z.string().describe("Issue tracker ID"),
        baseUrl: z.string().optional().describe("Base URL for the issue tracker"),
        issues: z.array(z.object({
            _id: z.string().describe("External ID"),
            id: z.string().describe("Issue ID"),
            name: z.string().describe("Issue title"),
            description: z.string().optional().describe("Issue description"),
            status: z.string().describe("Issue status"),
            url: z.string().describe("Issue URL"),
            creator: z.string().describe("Issue creator"),
            owner: z.string().optional().describe("Issue owner"),
            created: z.string().describe("Creation date (ISO string)"),
            lastUpdate: z.string().describe("Last update date (ISO string)"),
            type: z.string().describe("Issue type"),
            priority: z.string().optional().describe("Issue priority"),
            storyPoints: z.number().optional().describe("Story points"),
            labels: z.array(z.string()).optional().describe("Issue labels")
        })).describe("Array of issues to upload")
    },
    async ({ source, trackerId, baseUrl, issues }) => {
        try {
            const mutation = `
                mutation UploadIssueData($data: IssueDataIn!) {
                    uploadIssueData(data: $data) {
                        result
                        issueIds
                    }
                }
            `;

            const variables = {
                data: {
                    source,
                    trackerId,
                    tenantId,
                    baseUrl,
                    issues: issues.map(issue => ({
                        ...issue,
                        normalizedType: "OTHER" // Default normalized type
                    }))
                }
            };

            const result = await executeGraphQL(mutation, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Issue data uploaded: ${JSON.stringify(result.uploadIssueData, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error uploading issue data: ${error.message}` 
                }]
            };
        }
    }
);

// Metrics and Analytics Tools

// Tool to get deployment metrics
server.tool(
    "get_deployment_metrics",
    "Get deployment metrics with filtering and pagination",
    {
        teamIds: z.array(z.string()).optional().describe("Filter by team IDs"),
        appIds: z.array(z.string()).optional().describe("Filter by application IDs"),
        relativeTime: z.enum(["HOUR24", "DAY7", "DAY30", "DAY90", "MONTH6", "YEAR1", "ALL", "CUSTOM"]).optional().describe("Relative time filter"),
        customStartDate: z.string().optional().describe("Custom start date (ISO string)"),
        customEndDate: z.string().optional().describe("Custom end date (ISO string)"),
        queryString: z.string().optional().describe("DQL query string"),
        skip: z.number().optional().describe("Number of items to skip"),
        limit: z.number().optional().describe("Number of items to return")
    },
    async ({ teamIds, appIds, relativeTime, customStartDate, customEndDate, queryString, skip, limit }) => {
        try {
            const query = `
                query GetDeployments($query: DeploymentQuery) {
                    deployments(query: $query) {
                        items {
                            _id
                            id_external
                            name
                            description
                            tags
                            teams {
                                name
                                _id
                            }
                            version_name
                            application {
                                id
                                name
                                external_id
                            }
                            type
                            result
                            start_time
                            end_time
                            duration_mins
                            environment_name
                            by_user
                            url
                            deploymentType
                        }
                        count
                    }
                }
            `;

            const variables = {
                query: {
                    tenantId,
                    teamIds,
                    appIds,
                    relativeTime,
                    customStartDate,
                    customEndDate,
                    queryString,
                    pagination: (skip !== undefined || limit !== undefined) ? { skip, limit } : undefined
                }
            };

            const result = await executeGraphQL(query, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Deployment metrics retrieved: ${JSON.stringify(result.deployments, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error retrieving deployment metrics: ${error.message}` 
                }]
            };
        }
    }
);

// Tool to get build data
server.tool(
    "get_build_data",
    "Get build data with filtering and pagination",
    {
        teamIds: z.array(z.string()).optional().describe("Filter by team IDs"),
        appIds: z.array(z.string()).optional().describe("Filter by application IDs"),
        relativeTime: z.enum(["HOUR24", "DAY7", "DAY30", "DAY90", "MONTH6", "YEAR1", "ALL", "CUSTOM"]).optional().describe("Relative time filter"),
        customStartDate: z.string().optional().describe("Custom start date (ISO string)"),
        customEndDate: z.string().optional().describe("Custom end date (ISO string)"),
        source: z.array(z.string()).optional().describe("Filter by build source"),
        status: z.array(z.string()).optional().describe("Filter by build status"),
        skip: z.number().optional().describe("Number of items to skip"),
        limit: z.number().optional().describe("Number of items to return")
    },
    async ({ teamIds, appIds, relativeTime, customStartDate, customEndDate, source, status, skip, limit }) => {
        try {
            const query = `
                query GetBuilds($query: BuildTableQuery) {
                    builds(query: $query) {
                        items {
                            _id
                            id
                            name
                            status
                            url
                            startTime
                            endTime
                            requestor
                            revision
                            number
                            labels
                            source
                            branch
                            application {
                                id
                                externalId
                                name
                            }
                            parameters {
                                name
                                value
                                source
                            }
                        }
                        count
                    }
                }
            `;

            const variables = {
                query: {
                    filters: {
                        tenantId,
                        teamIds,
                        appIds,
                        relativeTime,
                        customStartDate,
                        customEndDate,
                        source,
                        status
                    },
                    pagination: (skip !== undefined || limit !== undefined) ? { skip, limit } : undefined
                }
            };

            const result = await executeGraphQL(query, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Build data retrieved: ${JSON.stringify(result.builds, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error retrieving build data: ${error.message}` 
                }]
            };
        }
    }
);

// Team Management Tools

// Tool to get teams
server.tool(
    "get_teams_by_tenant",
    "Get all teams for a tenant",
    {
        tenantId: z.string().optional().describe("Tenant ID (uses configured tenant if not provided)"),
        roleIds: z.array(z.string()).optional().describe("Filter by role IDs")
    },
    async ({ tenantId: providedTenantId, roleIds }) => {
        try {
            const query = `
                query GetTeamsByTenant($tenantId: ID!, $roleIds: [String]) {
                    teamsByTenantId(tenantId: $tenantId, roleIds: $roleIds) {
                        _id
                        tenantId
                        name
                    }
                }
            `;

            const variables = {
                tenantId: providedTenantId || tenantId,
                roleIds
            };

            const result = await executeGraphQL(query, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Teams retrieved: ${JSON.stringify(result.teamsByTenantId, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error retrieving teams: ${error.message}` 
                }]
            };
        }
    }
);

// Tool to create a team
server.tool(
    "create_team",
    "Create a new team",
    {
        name: z.string().describe("Team name"),
        tenantId: z.string().optional().describe("Tenant ID (uses configured tenant if not provided)")
    },
    async ({ name, tenantId: providedTenantId }) => {
        try {
            const mutation = `
                mutation AddNewTeam($name: String!, $tenantId: ID!) {
                    addNewTeam(name: $name, tenantId: $tenantId) {
                        _id
                        name
                        tenantId
                        origin
                    }
                }
            `;

            const variables = {
                name,
                tenantId: providedTenantId || tenantId
            };

            const result = await executeGraphQL(mutation, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Team created: ${JSON.stringify(result.addNewTeam, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error creating team: ${error.message}` 
                }]
            };
        }
    }
);

// Application Management Tools

// Tool to get applications by criteria
server.tool(
    "get_applications_by_criteria",
    "Get applications based on search criteria",
    {
        parentsOnly: z.boolean().optional().describe("Return only parent applications"),
        types: z.array(z.string()).optional().describe("Filter by application types"),
        integrationId: z.string().optional().describe("Filter by integration ID"),
        name: z.string().optional().describe("Filter by application name"),
        fuzzyName: z.boolean().optional().describe("Use fuzzy name matching"),
        tags: z.array(z.string()).optional().describe("Filter by tags"),
        limit: z.number().optional().describe("Maximum number of results"),
        offset: z.number().optional().describe("Number of results to skip")
    },
    async ({ parentsOnly, types, integrationId, name, fuzzyName, tags, limit, offset }) => {
        try {
            const query = `
                query GetApplicationsByCriteria($data: AppCriteriaIn!) {
                    applicationsByCriteria(data: $data) {
                        totalCount
                        apps {
                            _id
                            external_id
                            tenant_id
                            integration_id
                            name
                            alphaNumericName
                            active
                            createdAdHoc
                            type
                            version
                            level
                        }
                    }
                }
            `;

            const variables = {
                data: {
                    tenantId,
                    parentsOnly,
                    types,
                    integrationId,
                    name,
                    fuzzyName,
                    tags,
                    limit,
                    offset
                }
            };

            const result = await executeGraphQL(query, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Applications retrieved: ${JSON.stringify(result.applicationsByCriteria, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error retrieving applications: ${error.message}` 
                }]
            };
        }
    }
);

// Integration Management Tools

// Tool to get integrations
server.tool(
    "get_integrations_by_tenant",
    "Get all integrations for a tenant",
    {
        tenantId: z.string().optional().describe("Tenant ID (uses configured tenant if not provided)")
    },
    async ({ tenantId: providedTenantId }) => {
        try {
            const query = `
                query GetIntegrationsByTenant($tenantId: ID!) {
                    integrationsByTenantId(tenantId: $tenantId) {
                        _id
                        type
                        tenant_id
                        name
                        loggingLevel
                        displayName
                        showHidden
                        last_run_successful
                        last_run_completion_time
                        last_successful_execution_time
                        disabled
                        status
                        upgradeAvailable
                        image
                        properties
                        startTime
                        pluginId
                        plugin {
                            _id
                            pluginId
                            displayName
                            description
                            image
                            version
                        }
                    }
                }
            `;

            const variables = {
                tenantId: providedTenantId || tenantId
            };

            const result = await executeGraphQL(query, variables);
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `Integrations retrieved: ${JSON.stringify(result.integrationsByTenantId, null, 2)}` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error retrieving integrations: ${error.message}` 
                }]
            };
        }
    }
);

// Test tool to verify GraphQL connectivity
server.tool(
    "test_graphql_connection",
    "Test GraphQL connection with a simple query",
    {},
    async () => {
        try {
            const query = `
                query TestConnection {
                    __schema {
                        types {
                            name
                        }
                    }
                }
            `;

            const result = await executeGraphQL(query, {});
            
            return {
                content: [{ 
                    type: 'text', 
                    text: `GraphQL connection test successful: Found ${result.__schema.types.length} schema types` 
                }]
            };
        } catch (error) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `GraphQL connection test failed: ${error.message}` 
                }]
            };
        }
    }
);

// Helper function to handle GraphQL ID type conversions
function convertToGraphQLIDs(stringArray) {
    if (!stringArray || !Array.isArray(stringArray)) return undefined;
    return stringArray; // In practice, GraphQL IDs are just strings
}

// Helper function to build dynamic GraphQL queries with proper type handling
function buildDynamicQuery(baseQuery, dynamicParams, staticParams) {
    let queryParams = [];
    let queryArgs = [];
    let variables = {};

    // Add dynamic parameters
    for (const [key, config] of Object.entries(dynamicParams)) {
        if (config.value !== undefined) {
            queryParams.push(`$${key}: ${config.type}`);
            queryArgs.push(`${key}: $${key}`);
            variables[key] = config.value;
        }
    }

    // Add static parameters directly to query
    const staticArgs = Object.entries(staticParams)
        .filter(([key, value]) => value !== undefined)
        .map(([key, value]) => {
            if (Array.isArray(value)) {
                const valueList = value.map(v => `"${v}"`).join(', ');
                return `${key}: [${valueList}]`;
            }
            return `${key}: "${value}"`;
        });

    const allArgs = [...queryArgs, ...staticArgs];
    
    return {
        query: baseQuery
            .replace('{{PARAMS}}', queryParams.join(', '))
            .replace('{{ARGS}}', allArgs.join('\n                        ')),
        variables
    };
}

// Start the MCP server
const transport = new StdioServerTransport();
await server.connect(transport);

// Tool to add a gate to a pipeline stage
server.tool(
    "add_pipeline_gate",
    "Add a gate (manual, metric, compliance, or status) to a pipeline stage. This tool will create the specified rule and attach it as a gate to the given stage in the pipeline.",
    {
        pipelineId: z.string().describe("Pipeline ID"),
        stageId: z.string().describe("Stage ID (e.g., for DEV environment)"),
        gateType: z.enum(["manual", "metric", "compliance", "status"]).describe("Type of gate to add: manual, metric, compliance, or status"),
        gateName: z.string().min(1, "gateName is required").describe("Name for the gate/rule"),
        manualApprovers: z.array(z.object({ _id: z.string(), name: z.string(), type: z.enum(["user", "group"]).default("user") })).min(1, "At least one manual approver is required for manual gate").describe("Approvers for manual gate (required if gateType is manual)").optional(),
        metricRule: z.object({
            metricDefinition: z.object({ id: z.string(), name: z.string() }).optional(),
            dql: z.object({ type: z.string(), field: z.string(), value: z.number() }).optional(),
            description: z.string(),
            dataSet: z.string().optional(),
            timeRange: z.object({ type: z.string().optional(), value: z.number().optional() }).optional()
        }).optional().describe("Metric rule details (required if gateType is metric)"),
        complianceRule: z.object({
            description: z.string(),
            resource: z.string(),
            dql: z.object({ type: z.string(), field: z.string(), value: z.number() })
        }).optional().describe("Compliance rule details (required if gateType is compliance)"),
        statusRule: z.object({
            status: z.string(),
            description: z.string()
        }).optional().describe("Status rule details (required if gateType is status)"),
        manualGateNotification: z.boolean().default(true).describe("Whether to enable manual gate notification (default: true)")
    },
    async ({ pipelineId, stageId, gateType, gateName, manualApprovers, metricRule, complianceRule, statusRule, manualGateNotification }) => {
        try {
            let ruleId;
            // 1. Create the rule based on gateType
            if (gateType === "manual") {
                if (!gateName || typeof gateName !== "string" || gateName.trim() === "") {
                    throw new Error("gateName (rule name) is required for manual gate and must be a non-empty string");
                }
                if (!manualApprovers || !Array.isArray(manualApprovers) || manualApprovers.length === 0) {
                    throw new Error("manualApprovers (at least one user) is required for manual gate");
                }
                // Only allow user-type approvers (no group/team-only)
                const userApprovers = manualApprovers.filter(a => a.type === "user");
                if (userApprovers.length === 0) {
                    throw new Error("At least one manual approver of type 'user' is required for manual gate");
                }
                // Only send user approvers to the API (remove group/team-only entries)
                const mutation = `
                    mutation AddManualVersionSignOffRule($input: ManualVersionSignOffIn!) {
                        addManualVersionSignOffRule(input: $input) { _id name pipelineId approvers { _id name type } }
                    }
                `;
                const variables = {
                    input: {
                        name: gateName,
                        pipelineId,
                        approvers: userApprovers
                    }
                };
                const result = await executeGraphQL(mutation, variables);
                ruleId = result.addManualVersionSignOffRule._id;
            } else if (gateType === "metric") {
                if (!metricRule || !metricRule.metricDefinition || !metricRule.dql) {
                    throw new Error("metricRule.metricDefinition and metricRule.dql are required for metric gate");
                }
                const mutation = `
                    mutation AddAutomatedMetricRule($input: AutomatedMetricCriterionIn!) {
                        addAutomatedMetricRule(input: $input) { _id name pipelineId }
                    }
                `;
                const variables = {
                    input: {
                        pipelineId,
                        name: gateName,
                        description: metricRule.description,
                        metricDefinition: metricRule.metricDefinition,
                        dql: metricRule.dql,
                        dataSet: metricRule.dataSet,
                        timeRange: metricRule.timeRange
                    }
                };
                const result = await executeGraphQL(mutation, variables);
                ruleId = result.addAutomatedMetricRule._id;
            } else if (gateType === "compliance") {
                if (!complianceRule || !complianceRule.resource || !complianceRule.dql) {
                    throw new Error("complianceRule.resource and complianceRule.dql are required for compliance gate");
                }
                const mutation = `
                    mutation AddComplianceRule($input: ComplianceRuleIn!) {
                        addComplianceRule(input: $input) { _id name pipelineId }
                    }
                `;
                const variables = {
                    input: {
                        pipelineId,
                        name: gateName,
                        description: complianceRule.description,
                        resource: complianceRule.resource,
                        dql: complianceRule.dql
                    }
                };
                const result = await executeGraphQL(mutation, variables);
                ruleId = result.addComplianceRule._id;
            } else if (gateType === "status") {
                if (!statusRule || !statusRule.status) {
                    throw new Error("statusRule.status is required for status gate");
                }
                const mutation = `
                    mutation AddStatusRule($input: StatusRuleIn!) {
                        addStatusRule(input: $input) { _id name pipelineId }
                    }
                `;
                const variables = {
                    input: {
                        pipelineId,
                        name: gateName,
                        status: statusRule.status,
                        description: statusRule.description
                    }
                };
                const result = await executeGraphQL(mutation, variables);
                ruleId = result.addStatusRule._id;
            } else {
                throw new Error("Unsupported gateType");
            }

            // 2. Attach the rule as a gate to the stage
            const upsertMutation = `
                mutation UpsertPipelineGate($pipelineId: ID!, $stageId: ID!, $ruleIds: [ID!]!, $manualGateNotification: Boolean!) {
                    upsertPipelineGate(pipelineId: $pipelineId, stageId: $stageId, ruleIds: $ruleIds, manualGateNotification: $manualGateNotification) {
                        _id pipelineId stageId rules { ruleType { ... on ManualVersionSignOff { _id name } ... on AutomatedMetricCriterion { _id name } ... on ComplianceRule { _id name } ... on StatusRule { _id name } } } manualGateNotification
                    }
                }
            `;
            const upsertVars = {
                pipelineId,
                stageId,
                ruleIds: [ruleId],
                manualGateNotification
            };
            const upsertResult = await executeGraphQL(upsertMutation, upsertVars);
            return {
                content: [{
                    type: 'text',
                    text: `Gate added to pipeline stage: ${JSON.stringify(upsertResult.upsertPipelineGate, null, 2)}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error adding gate: ${error.message}`
                }]
            };
        }
    }
);

// Tool to get metadata about the current access key (and user info)
server.tool(
    "get_my_access_key_metadata",
    "Get metadata about the current access key, including user info if available.",
    {},
    async () => {
        try {
            const query = `
                query MyAccessKeyMetaData {
                    myAccessKeyMetaData {
                        userId
                        email
                        id
                        name
                        created
                        lastUsed
                    }
                }
            `;
            const result = await executeGraphQL(query, {});
            return {
                content: [{
                    type: 'text',
                    text: `Access key metadata: ${JSON.stringify(result.myAccessKeyMetaData, null, 2)}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error retrieving access key metadata: ${error.message}`
                }]
            };
        }
    }
);
// Tool to add application stages to a pipeline
server.tool(
    "add_application_stages",
    "Add application stages to a pipeline using the addApplicationStages mutation.",
    {
        pipelineId: z.string().describe("Pipeline ID"),
        stageId: z.string().describe("Stage ID"),
        environments: z.array(z.object({
            name: z.string().describe("Environment name"),
            description: z.string().optional().describe("Environment description")
            // Add more EnvInput fields here as needed
        })).describe("List of environments (EnvInput)")
    },
    async ({ pipelineId, stageId, environments }) => {
        try {
            const mutation = `
                mutation AddApplicationStages($pipelineId: ID!, $stageId: String!, $environments: [EnvInput]!) {
                    addApplicationStages(pipelineId: $pipelineId, stageId: $stageId, environments: $environments) {
                        _id
                        name
                        description
                        # Add more fields as needed from PipelineApplicationStage
                    }
                }
            `;
            const variables = { pipelineId, stageId, environments };
            const result = await executeGraphQL(mutation, variables);
            return {
                content: [{
                    type: 'text',
                    text: `Application stages added: ${JSON.stringify(result.addApplicationStages, null, 2)}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error adding application stages: ${error.message}`
                }]
            };
        }
    }
);

// Tool to add a stage to a pipeline
server.tool(
    "add_stage",
    "Add a stage to a pipeline using the addStage mutation.",
    {
        pipelineId: z.string().describe("Pipeline ID"),
        stage: z.object({
            name: z.string().describe("Stage name"),
            description: z.string().optional().describe("Stage description")
            // Add more StageInput fields as needed
        }).describe("StageInput")
    },
    async ({ pipelineId, stage }) => {
        try {
            const mutation = `
                mutation AddStage($pipelineId: ID!, $stage: StageInput!) {
                    addStage(pipelineId: $pipelineId, stage: $stage) {
                        _id
                        name
                        description
                        # Add more fields as needed
                    }
                }
            `;
            const variables = { pipelineId, stage };
            const result = await executeGraphQL(mutation, variables);
            return {
                content: [{
                    type: 'text',
                    text: `Stage added: ${JSON.stringify(result.addStage, null, 2)}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error adding stage: ${error.message}`
                }]
            };
        }
    }
);

// Tool to update a stage in a pipeline
server.tool(
    "update_stage",
    "Update a stage in a pipeline using the updateStage mutation.",
    {
        pipelineId: z.string().describe("Pipeline ID"),
        stageId: z.string().describe("Stage ID"),
        updates: z.object({
            name: z.string().optional().describe("Stage name"),
            description: z.string().optional().describe("Stage description")
            // Add more UpdateStageInput fields as needed
        }).describe("UpdateStageInput")
    },
    async ({ pipelineId, stageId, updates }) => {
        try {
            const mutation = `
                mutation UpdateStage($pipelineId: ID!, $stageId: String!, $updates: UpdateStageInput!) {
                    updateStage(pipelineId: $pipelineId, stageId: $stageId, updates: $updates) {
                        _id
                        name
                        description
                        # Add more fields as needed
                    }
                }
            `;
            const variables = { pipelineId, stageId, updates };
            const result = await executeGraphQL(mutation, variables);
            return {
                content: [{
                    type: 'text',
                    text: `Stage updated: ${JSON.stringify(result.updateStage, null, 2)}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error updating stage: ${error.message}`
                }]
            };
        }
    }
);

// Tool to delete a stage from a pipeline
server.tool(
    "delete_stage",
    "Delete a stage from a pipeline using the deleteStage mutation.",
    {
        pipelineId: z.string().describe("Pipeline ID"),
        stageId: z.string().describe("Stage ID")
    },
    async ({ pipelineId, stageId }) => {
        try {
            const mutation = `
                mutation DeleteStage($pipelineId: ID!, $stageId: String!) {
                    deleteStage(pipelineId: $pipelineId, stageId: $stageId) {
                        success
                        message
                    }
                }
            `;
            const variables = { pipelineId, stageId };
            const result = await executeGraphQL(mutation, variables);
            return {
                content: [{
                    type: 'text',
                    text: `Stage deleted: ${JSON.stringify(result.deleteStage, null, 2)}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error deleting stage: ${error.message}`
                }]
            };
        }
    }
);

// Tool to update a workflow (VSM)
server.tool(
    "update_workflow",
    "Update a workflow (VSM) using the updateWorkflow mutation.",
    {
        workflowId: z.string().describe("Workflow ID"),
        updates: z.object({
            name: z.string().optional().describe("Workflow name"),
            description: z.string().optional().describe("Workflow description")
            // Add more fields as needed
        }).describe("WorkflowQuery")
    },
    async ({ workflowId, updates }) => {
        try {
            const mutation = `
                mutation UpdateWorkflow($workflowId: ID!, $updates: WorkflowQuery!) {
                    updateWorkflow(workflowId: $workflowId, updates: $updates) {
                        _id
                        name
                        description
                        # Add more fields as needed
                    }
                }
            `;
            const variables = { workflowId, updates };
            const result = await executeGraphQL(mutation, variables);
            return {
                content: [{
                    type: 'text',
                    text: `Workflow updated: ${JSON.stringify(result.updateWorkflow, null, 2)}`
                }]
            };
        } catch (error) {
            return {
                content: [{
                    type: 'text',
                    text: `Error updating workflow: ${error.message}`
                }]
            };
        }
    }
);
