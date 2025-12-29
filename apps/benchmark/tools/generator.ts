/**
 * Tool Generator
 *
 * Generates fake tools with realistic names and schemas for benchmarking.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolWithHandler } from "../types";

/**
 * Tool templates organized by category
 */
const TOOL_TEMPLATES: Record<
  string,
  Array<{
    name: string;
    description: string;
    inputSchema: Tool["inputSchema"];
  }>
> = {
  email: [
    {
      name: "send_email",
      description: "Send an email to one or more recipients",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content" },
          cc: { type: "string", description: "CC recipients (optional)" },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: "read_emails",
      description: "Read emails from inbox with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string", description: "Email folder to read from" },
          unread_only: { type: "boolean", description: "Only unread emails" },
          limit: { type: "number", description: "Maximum emails to return" },
        },
      },
    },
    {
      name: "delete_email",
      description: "Delete an email by ID",
      inputSchema: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "Email ID to delete" },
        },
        required: ["email_id"],
      },
    },
    {
      name: "forward_email",
      description: "Forward an email to another recipient",
      inputSchema: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "Email ID to forward" },
          to: { type: "string", description: "Forward recipient" },
          message: { type: "string", description: "Additional message" },
        },
        required: ["email_id", "to"],
      },
    },
  ],
  calendar: [
    {
      name: "create_calendar_event",
      description: "Create a new calendar event",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          date: { type: "string", description: "Event date" },
          time: { type: "string", description: "Event time" },
          duration: { type: "number", description: "Duration in minutes" },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "List of attendee emails",
          },
        },
        required: ["title", "date", "time"],
      },
    },
    {
      name: "list_calendar_events",
      description: "List calendar events for a date range",
      inputSchema: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date" },
          end_date: { type: "string", description: "End date" },
        },
        required: ["start_date", "end_date"],
      },
    },
    {
      name: "cancel_calendar_event",
      description: "Cancel a calendar event",
      inputSchema: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "Event ID to cancel" },
          notify_attendees: {
            type: "boolean",
            description: "Notify attendees of cancellation",
          },
        },
        required: ["event_id"],
      },
    },
    {
      name: "reschedule_event",
      description: "Reschedule an existing calendar event",
      inputSchema: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "Event ID to reschedule" },
          new_date: { type: "string", description: "New date" },
          new_time: { type: "string", description: "New time" },
        },
        required: ["event_id", "new_date", "new_time"],
      },
    },
  ],
  files: [
    {
      name: "search_files",
      description: "Search for files by name or content",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          folder: { type: "string", description: "Folder to search in" },
          file_type: { type: "string", description: "File type filter" },
        },
        required: ["query"],
      },
    },
    {
      name: "read_file",
      description: "Read contents of a file",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write content to a file",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "delete_file",
      description: "Delete a file",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to delete" },
        },
        required: ["path"],
      },
    },
    {
      name: "copy_file",
      description: "Copy a file to a new location",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string", description: "Source file path" },
          destination: { type: "string", description: "Destination path" },
        },
        required: ["source", "destination"],
      },
    },
  ],
  database: [
    {
      name: "query_database",
      description: "Execute a database query",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "SQL query to execute" },
          database: { type: "string", description: "Database name" },
        },
        required: ["query"],
      },
    },
    {
      name: "insert_record",
      description: "Insert a record into a database table",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name" },
          data: { type: "object", description: "Record data" },
        },
        required: ["table", "data"],
      },
    },
    {
      name: "update_record",
      description: "Update a record in a database table",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name" },
          id: { type: "string", description: "Record ID" },
          data: { type: "object", description: "Updated data" },
        },
        required: ["table", "id", "data"],
      },
    },
    {
      name: "delete_record",
      description: "Delete a record from a database table",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Table name" },
          id: { type: "string", description: "Record ID" },
        },
        required: ["table", "id"],
      },
    },
  ],
  api: [
    {
      name: "http_get",
      description: "Make an HTTP GET request",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to request" },
          headers: { type: "object", description: "Request headers" },
        },
        required: ["url"],
      },
    },
    {
      name: "http_post",
      description: "Make an HTTP POST request",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL to request" },
          body: { type: "object", description: "Request body" },
          headers: { type: "object", description: "Request headers" },
        },
        required: ["url", "body"],
      },
    },
    {
      name: "webhook_send",
      description: "Send a webhook notification",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Webhook URL" },
          payload: { type: "object", description: "Webhook payload" },
        },
        required: ["url", "payload"],
      },
    },
  ],
  notifications: [
    {
      name: "send_notification",
      description: "Send a push notification",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "User ID to notify" },
          title: { type: "string", description: "Notification title" },
          message: { type: "string", description: "Notification message" },
        },
        required: ["user_id", "title", "message"],
      },
    },
    {
      name: "send_sms",
      description: "Send an SMS message",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number" },
          message: { type: "string", description: "SMS message" },
        },
        required: ["phone", "message"],
      },
    },
    {
      name: "send_slack_message",
      description: "Send a Slack message",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Slack channel" },
          message: { type: "string", description: "Message content" },
        },
        required: ["channel", "message"],
      },
    },
  ],
  analytics: [
    {
      name: "get_metrics",
      description: "Get analytics metrics",
      inputSchema: {
        type: "object",
        properties: {
          metric_name: { type: "string", description: "Metric to retrieve" },
          start_date: { type: "string", description: "Start date" },
          end_date: { type: "string", description: "End date" },
        },
        required: ["metric_name"],
      },
    },
    {
      name: "generate_report",
      description: "Generate an analytics report",
      inputSchema: {
        type: "object",
        properties: {
          report_type: { type: "string", description: "Type of report" },
          date_range: { type: "string", description: "Date range" },
          format: { type: "string", description: "Output format (pdf, csv)" },
        },
        required: ["report_type"],
      },
    },
    {
      name: "track_event",
      description: "Track an analytics event",
      inputSchema: {
        type: "object",
        properties: {
          event_name: { type: "string", description: "Event name" },
          properties: { type: "object", description: "Event properties" },
        },
        required: ["event_name"],
      },
    },
  ],
  users: [
    {
      name: "get_user",
      description: "Get user information",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "User ID" },
        },
        required: ["user_id"],
      },
    },
    {
      name: "update_user",
      description: "Update user information",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "User ID" },
          data: { type: "object", description: "Updated user data" },
        },
        required: ["user_id", "data"],
      },
    },
    {
      name: "list_users",
      description: "List all users",
      inputSchema: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Filter criteria" },
          limit: { type: "number", description: "Maximum users to return" },
        },
      },
    },
    {
      name: "create_user",
      description: "Create a new user",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "User email" },
          name: { type: "string", description: "User name" },
          role: { type: "string", description: "User role" },
        },
        required: ["email", "name"],
      },
    },
  ],
  tasks: [
    {
      name: "create_task",
      description: "Create a new task",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Task description" },
          due_date: { type: "string", description: "Due date" },
          assignee: { type: "string", description: "Assignee user ID" },
        },
        required: ["title"],
      },
    },
    {
      name: "complete_task",
      description: "Mark a task as complete",
      inputSchema: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "Task ID" },
        },
        required: ["task_id"],
      },
    },
    {
      name: "list_tasks",
      description: "List tasks with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Task status filter" },
          assignee: { type: "string", description: "Assignee filter" },
        },
      },
    },
  ],
};

/**
 * Get all tool templates as a flat array
 */
function getAllTemplates(): Array<{
  name: string;
  description: string;
  inputSchema: Tool["inputSchema"];
}> {
  return Object.values(TOOL_TEMPLATES).flat();
}

/**
 * Generate a unique tool name with suffix
 */
function generateUniqueName(baseName: string, index: number): string {
  if (index === 0) return baseName;
  return `${baseName}_v${index + 1}`;
}

/**
 * Create a mock handler for a tool
 */
function createMockHandler(
  toolName: string,
): (args: Record<string, unknown>) => Promise<unknown> {
  return async (args: Record<string, unknown>) => {
    return {
      success: true,
      tool: toolName,
      message: `Mock response from ${toolName}`,
      receivedArgs: args,
    };
  };
}

/**
 * Generate tools with handlers for the fake MCP server
 *
 * @param count - Number of tools to generate
 * @param targetTool - The target tool that must be included (for the benchmark task)
 * @returns Array of tools with handlers
 */
export function generateTools(
  count: number,
  targetTool: {
    name: string;
    description: string;
    inputSchema: Tool["inputSchema"];
  },
): ToolWithHandler[] {
  const templates = getAllTemplates();
  const tools: ToolWithHandler[] = [];
  const usedNames = new Set<string>();

  // First, add the target tool at a random position
  const targetPosition = Math.floor(Math.random() * count);

  // Generate tools
  let templateIndex = 0;
  let versionIndex = 0;

  for (let i = 0; i < count; i++) {
    if (i === targetPosition) {
      // Add the target tool
      tools.push({
        tool: {
          name: targetTool.name,
          description: targetTool.description,
          inputSchema: targetTool.inputSchema,
        },
        handler: createMockHandler(targetTool.name),
      });
      usedNames.add(targetTool.name);
    } else {
      // Add a generated tool
      let template = templates[templateIndex % templates.length];

      // Skip if this is the target tool template
      if (template.name === targetTool.name) {
        templateIndex++;
        template = templates[templateIndex % templates.length];
      }

      let name = generateUniqueName(template.name, versionIndex);

      // Ensure unique name
      while (usedNames.has(name)) {
        versionIndex++;
        name = generateUniqueName(template.name, versionIndex);
      }

      usedNames.add(name);

      tools.push({
        tool: {
          name,
          description: template.description,
          inputSchema: template.inputSchema,
        },
        handler: createMockHandler(name),
      });

      templateIndex++;
      if (templateIndex >= templates.length) {
        templateIndex = 0;
        versionIndex++;
      }
    }
  }

  return tools;
}

/**
 * Get the target tool definition for a given task
 */
export function getTargetToolForTask(task: { tool: string }): {
  name: string;
  description: string;
  inputSchema: Tool["inputSchema"];
} {
  const templates = getAllTemplates();
  const template = templates.find((t) => t.name === task.tool);

  if (template) {
    return template;
  }

  // Default fallback
  return {
    name: task.tool,
    description: `Execute ${task.tool} operation`,
    inputSchema: {
      type: "object",
      properties: {},
    },
  };
}
