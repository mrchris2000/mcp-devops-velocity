#!/usr/bin/env node

// Configuration setup script for MCP DevOps Velocity
import { readFileSync, writeFileSync } from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
  console.log('MCP DevOps Velocity Configuration Setup');
  console.log('====================================\n');
  
  const token = await question('Enter your Velocity access token: ');
  const serverUrl = await question('Enter your Velocity GraphQL URL (e.g., https://your-server.com/graphql): ');
  const tenantId = await question('Enter your Velocity tenant ID: ');
  
  const envContent = `# MCP DevOps Velocity Configuration
VELOCITY_ACCESS_TOKEN=${token}
VELOCITY_GRAPHQL_URL=${serverUrl}
VELOCITY_TENANT_ID=${tenantId}
`;

  try {
    writeFileSync('.env', envContent);
    console.log('Configuration saved to .env file');
    console.log('You can now run the MCP server with: node src/lib/velocity.js');
  } catch (error) {
    console.error('Error saving configuration:', error.message);
  }
  
  rl.close();
}

setup().catch(console.error);
