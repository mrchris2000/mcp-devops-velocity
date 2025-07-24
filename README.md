# MCP Velocity GraphQL Server

A Model Context Protocol (MCP) server implementation for Velocity, enabling comprehensive DevOps automation through the Velocity GraphQL API.

## Features

### Release Management
- Create, update, and query release events
- Manage deployment schedules and scheduling
- Track release status and progress

### Pipeline & Value Stream Management
- Manage pipelines and stages
- Monitor value stream workflows
- Track particles (work items) through stages
- Get workflow metrics and analytics

### Issue & Work Item Tracking
- Query and upload issue data
- Track work items across sprints and releases
- Manage issue relationships and history

### Metrics & Analytics
- Retrieve deployment and build metrics
- Generate analytics reports
- Export data for analysis

### Team & Application Management
- Manage teams and users
- Query applications and environments
- Handle integrations and plugins

## Configuration

The Velocity server requires GraphQL endpoint configuration. You can provide configuration in several ways:

### Quick Setup

Copy the example environment file:

```bash
cp .env.example .env
# Edit .env.velocity with your actual configuration values
```

### Option 1: Environment Variables

Set the following environment variables:

```bash
export VELOCITY_GRAPHQL_URL="https://your-velocity-server.com/graphql"
export VELOCITY_ACCESS_TOKEN="your_access_token_here"
export VELOCITY_TENANT_ID="your-tenant-id-here"
```

### Option 2: Command Line Arguments

Pass configuration as command line arguments:

```bash
node src/lib/velocity.js --url "https://your-velocity-server.com/graphql" --token "your_token" --tenant-id "your-tenant-id"
```

### Option 3: Environment File

Create a `.env` file with your Velocity configuration:

```bash
VELOCITY_GRAPHQL_URL=https://your-velocity-server.com/graphql
VELOCITY_ACCESS_TOKEN=your_access_token_here
VELOCITY_TENANT_ID=your-tenant-id-here
```

## Installation

### Option 1: NPM Script (Recommended)

```bash
npm run start:velocity -- --url "https://your-server.com/graphql" --token "your_token" --tenant-id "your-tenant-id"
```

### Option 2: Direct Execution

```bash
node src/lib/velocity.js --url "https://your-server.com/graphql" --token "your_token" --tenant-id "your-tenant-id"
```

## Use with Claude Desktop

Add the following to your Claude Desktop MCP configuration:

### Option 1: Environment Variables

```json
{
  "mcpServers": {
    "velocity": {
      "command": "node",
      "args": ["/path/to/mcp-devops-velocity/src/lib/velocity.js"],
      "env": {
        "VELOCITY_GRAPHQL_URL": "https://your-velocity-server.com/graphql",
        "VELOCITY_ACCESS_TOKEN": "your_access_token_here",
        "VELOCITY_TENANT_ID": "your-tenant-id-here"
      }
    }
  }
}
```

### Option 2: Command Line Arguments

```json
{
  "mcpServers": {
    "velocity": {
      "command": "node",
      "args": [
        "/path/to/mcp-devops-velocity/src/lib/velocity.js",
        "--url", "https://your-velocity-server.com/graphql",
        "--token", "your_access_token_here",
        "--tenant-id", "your-tenant-id-here"
      ]
    }
  }
}
```

## Available Tools

### Release Management Tools

#### `get_release_events`
Retrieve release events with optional filtering and pagination.

**Parameters:**
- `first` (optional): Number of items to return
- `tags` (optional): Filter by tag IDs
- `teamIds` (optional): Filter by team IDs
- `dateRange` (optional): Date range filter with start and end dates
- `status` (optional): Filter by status (DONE, IN_PROGRESS, SCHEDULED, FAILED)
- `state` (optional): Filter by state (ARCHIVED, DEFAULT)

#### `create_release_event`
Create a new release event.

**Parameters:**
- `name`: Name of the release event
- `teamId`: Team ID
- `teamName`: Team name
- `start`: Start date (ISO string)
- `end`: End date (ISO string)
- `description` (optional): Description
- `tags` (optional): Tag IDs to associate
- `isEvent` (optional): Whether this is an event
- `summary` (optional): Summary of the release

### Pipeline Management Tools

#### `get_pipelines_by_tenant`
Get all pipelines for a tenant.

**Parameters:**
- `tenantId` (optional): Tenant ID (uses configured tenant if not provided)

#### `create_pipeline`
Create a new pipeline.

**Parameters:**
- `pipelineName`: Name of the pipeline
- `pipelineDesc` (optional): Description
- `teamId`: Team ID
- `teamName`: Team name
- `defaultEnvironments` (optional): Whether to create default environments

### Value Stream Management Tools

#### `get_workflows_for_tenant`
Get all workflows (value streams) for a tenant.

**Parameters:**
- `tenantId` (optional): Tenant ID

#### `get_particles_by_stage`
Get particles (work items) in a specific stage of a workflow.

**Parameters:**
- `workflowId`: Workflow ID
- `stageName`: Stage name
- `particleIds` (optional): Filter by specific particle IDs
- `skip` (optional): Number of items to skip
- `limit` (optional): Number of items to return

### Issue Management Tools

#### `get_issues`
Get issues with filtering options.

**Parameters:**
- `tenantId` (optional): Tenant ID
- `internalIds` (optional): Filter by internal IDs
- `skip` (optional): Number of items to skip
- `limit` (optional): Number of items to return

#### `upload_issue_data`
Upload issue data to Velocity.

**Parameters:**
- `source`: Source system name
- `trackerId`: Issue tracker ID
- `baseUrl` (optional): Base URL for the issue tracker
- `issues`: Array of issues to upload

### Metrics & Analytics Tools

#### `get_deployment_metrics`
Get deployment metrics with filtering and pagination.

**Parameters:**
- `teamIds` (optional): Filter by team IDs
- `appIds` (optional): Filter by application IDs
- `relativeTime` (optional): Relative time filter
- `customStartDate` (optional): Custom start date
- `customEndDate` (optional): Custom end date
- `queryString` (optional): DQL query string
- `skip` (optional): Number of items to skip
- `limit` (optional): Number of items to return

#### `get_build_data`
Get build data with filtering and pagination.

**Parameters:**
- Similar to deployment metrics with additional build-specific filters
- `source` (optional): Filter by build source
- `status` (optional): Filter by build status

### Team Management Tools

#### `get_teams_by_tenant`
Get all teams for a tenant.

**Parameters:**
- `tenantId` (optional): Tenant ID
- `roleIds` (optional): Filter by role IDs

#### `create_team`
Create a new team.

**Parameters:**
- `name`: Team name
- `tenantId` (optional): Tenant ID

### Application Management Tools

#### `get_applications_by_criteria`
Get applications based on search criteria.

**Parameters:**
- `parentsOnly` (optional): Return only parent applications
- `types` (optional): Filter by application types
- `integrationId` (optional): Filter by integration ID
- `name` (optional): Filter by application name
- `fuzzyName` (optional): Use fuzzy name matching
- `tags` (optional): Filter by tags
- `limit` (optional): Maximum number of results
- `offset` (optional): Number of results to skip

### Integration Management Tools

#### `get_integrations_by_tenant`
Get all integrations for a tenant.

**Parameters:**
- `tenantId` (optional): Tenant ID

## Example Usage

### Get Release Events
```
Get all release events for the current tenant that are in progress
```

### Create a Release Event
```
Create a new release event named "v2.1.0 Release" for team "Development Team" (ID: team-123) starting on 2024-02-01 and ending on 2024-02-15
```

### Query Value Stream
```
Get all workflows for the current tenant and show me the lead time metrics
```

### Track Work Items
```
Show me all particles in the "In Progress" stage of workflow "workflow-456"
```

### Get Deployment Metrics
```
Get deployment metrics for the last 30 days filtered by team "DevOps Team"
```

## Error Handling

The server includes comprehensive error handling for:
- GraphQL query errors
- Network connectivity issues
- Authentication failures
- Invalid parameter validation

All errors are returned with descriptive messages to help with troubleshooting.

## Security

- Uses Bearer token authentication for GraphQL API access
- Validates all input parameters using Zod schemas
- Secure environment variable handling
- No sensitive data logged in output

## Contributing

This MCP server follows the same patterns as the main DevOps Velocity server. When adding new tools:

1. Define the tool with proper Zod schema validation
2. Implement GraphQL query/mutation with proper error handling
3. Return structured JSON responses
4. Add documentation for the new tool

## License

ISC License - see LICENSE file for details.
