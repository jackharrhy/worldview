import { z } from 'zod';
import { mcpResourceUrl, requireMcpAdmin, WORLDVIEW_MCP_SCOPE } from '../mcp-auth.js';
import { mcpOperationsByName, mcpToolDescriptions } from '../mcp-operations.js';
import { requestBody, sendError, ServiceHttpError } from '../service-http.js';
import { defineRoute } from '../service-routing.js';
import type { WorldviewServiceOptions } from '../service-options.js';

const SUPPORTED_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;
const RpcRequestSchema = z.strictObject({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

function sendRpc(response: import('node:http').ServerResponse, body: unknown): void {
  const data = JSON.stringify(body);
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  response.end(data);
}

export function createMcpRoutes(options: WorldviewServiceOptions) {
  return [
    defineRoute(
      'mcp-protected-resource',
      'GET',
      '/.well-known/oauth-protected-resource/mcp',
      (context) => {
        if (!options.mcpAuth)
          return sendError(context.response, 503, 'Worldview MCP is not configured');
        const data = JSON.stringify({
          resource: mcpResourceUrl(options.mcpAuth),
          authorization_servers: [options.mcpAuth.fourmUrl],
          bearer_methods_supported: ['header'],
          scopes_supported: ['openid', WORLDVIEW_MCP_SCOPE],
        });
        context.response.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'Cache-Control': 'public, max-age=300',
        });
        context.response.end(data);
      },
    ),
    defineRoute('mcp-get', 'GET', '/mcp', (context) => {
      context.response.setHeader('Allow', 'POST');
      sendError(context.response, 405, 'MCP SSE streams are not offered');
    }),
    defineRoute('mcp-post', 'POST', '/mcp', async (context) => {
      const config = options.mcpAuth;
      if (!config) return sendError(context.response, 503, 'Worldview MCP is not configured');
      const origin = context.request.headers.origin;
      if (
        (origin && origin !== config.publicUrl) ||
        context.request.headers.host !== new URL(config.publicUrl).host
      ) {
        return sendError(context.response, 403, 'Worldview MCP origin is not allowed');
      }
      let user;
      try {
        user = await requireMcpAdmin(
          context.request.headers.authorization,
          config,
          options.database,
          options.fetch,
        );
      } catch (error) {
        if (!(error instanceof ServiceHttpError)) throw error;
        if (error.status === 401) {
          context.response.setHeader(
            'WWW-Authenticate',
            `Bearer resource_metadata="${config.publicUrl}/.well-known/oauth-protected-resource/mcp", scope="openid ${WORLDVIEW_MCP_SCOPE}"`,
          );
        }
        return sendError(context.response, error.status, error.message);
      }
      const request = await requestBody(context.request, RpcRequestSchema, 3 * 1024 * 1024);
      if (!Object.hasOwn(request, 'id')) {
        context.response.writeHead(request.method === 'notifications/initialized' ? 202 : 400, {
          'Cache-Control': 'no-store',
        });
        context.response.end();
        return;
      }
      const id = request.id ?? null;
      if (request.method === 'initialize') {
        const requested = request.params?.protocolVersion;
        const version =
          typeof requested === 'string' && SUPPORTED_VERSIONS.includes(requested as never)
            ? requested
            : SUPPORTED_VERSIONS[0];
        return sendRpc(context.response, {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: version,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'worldview', version: '0.1.0' },
          },
        });
      }
      const protocolVersion = context.request.headers['mcp-protocol-version'];
      if (protocolVersion && !SUPPORTED_VERSIONS.includes(String(protocolVersion) as never)) {
        return sendError(context.response, 400, 'Unsupported MCP protocol version');
      }
      if (request.method === 'tools/list') {
        return sendRpc(context.response, {
          jsonrpc: '2.0',
          id,
          result: {
            tools: mcpToolDescriptions,
          },
        });
      }
      if (request.method === 'tools/call') {
        const name = String(request.params?.name ?? '');
        const tool = mcpOperationsByName.get(name);
        if (!tool)
          return sendRpc(context.response, {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Unknown tool: ${name}` }],
              isError: true,
            },
          });
        try {
          const value = await tool.execute(options, user, request.params?.arguments ?? {});
          return sendRpc(context.response, {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
              structuredContent: value,
            },
          });
        } catch (error) {
          const message =
            error instanceof ServiceHttpError || error instanceof z.ZodError
              ? error.message
              : 'Tool failed';
          if (!(error instanceof ServiceHttpError || error instanceof z.ZodError)) {
            console.error('Worldview MCP tool failed', error);
          }
          return sendRpc(context.response, {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: message }],
              isError: true,
            },
          });
        }
      }
      sendRpc(context.response, {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: 'Method not found' },
      });
    }),
  ] as const;
}
