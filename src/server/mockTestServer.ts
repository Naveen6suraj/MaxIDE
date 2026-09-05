/**
 * MaxIDE - Unlimited AI Provider Platform
 * Embedded Mock Test Server
 * Simulates real OpenAI-compatible and Ollama endpoints for tests and offline demonstrations.
 */

import http from 'http';

export class MockEndpointServer {
  private server?: http.Server;
  public readonly port: number;

  constructor(port: number = 11438) {
    this.port = port;
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = req.url || '';
        const method = req.method || 'GET';

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

        if (method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        // 1. Ollama Tag endpoint: /api/tags
        if (url.startsWith('/api/tags') && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            models: [
              { name: 'llama3:latest', model: 'llama3', details: { parameter_size: '8B', family: 'llama' } },
              { name: 'qwen2.5-coder:7b', model: 'qwen2.5-coder', details: { parameter_size: '7B', family: 'qwen2' } },
              { name: 'deepseek-coder:6.7b', model: 'deepseek-coder', details: { parameter_size: '6.7B', family: 'deepseek' } },
              { name: 'nemotron-mini:4b', model: 'nemotron-mini', details: { parameter_size: '4B', family: 'nemotron' } },
            ],
          }));
          return;
        }

        // 2. Ollama Chat endpoint: /api/chat
        if (url.startsWith('/api/chat') && method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const parsed = JSON.parse(body || '{}');
            const messages = parsed.messages || [];
            const lastMsg = messages[messages.length - 1];

            // If last message was a tool result, complete
            if (lastMsg?.role === 'tool') {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                model: parsed.model || 'llama3',
                message: {
                  role: 'assistant',
                  content: 'Task completed successfully using local Ollama model.',
                },
                done: true,
                prompt_eval_count: 55,
                eval_count: 22,
              }));
              return;
            }

            // If user asked to write/create a file, trigger tool calling
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              model: parsed.model || 'llama3',
              message: {
                role: 'assistant',
                content: 'Creating file using local Ollama model.\n',
                tool_calls: [
                  {
                    function: {
                      name: 'writeFile',
                      arguments: {
                        path: 'ollama_result.txt',
                        content: 'Created by local Ollama model inside MaxIDE Agent Engine.',
                      },
                    },
                  },
                ],
              },
              done: true,
              prompt_eval_count: 60,
              eval_count: 35,
            }));
          });
          return;
        }

        // 3. OpenAI-compatible /v1/models
        if (url.startsWith('/v1/models') && method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            object: 'list',
            data: [
              { id: 'custom-gpt-4o', name: 'Custom GPT-4o', context_length: 128000 },
              { id: 'nemotron-4-340b-instruct', name: 'Nemotron 4 340B Instruct', context_length: 131072 },
              { id: 'vllm-mistral-7b', name: 'vLLM Mistral 7B', context_length: 32768 },
            ],
          }));
          return;
        }

        // 4. OpenAI-compatible /v1/chat/completions
        if (url.startsWith('/v1/chat/completions') && method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            const parsed = JSON.parse(body || '{}');
            const messages = parsed.messages || [];
            const lastMsg = messages[messages.length - 1];

            // Handle streaming SSE
            if (parsed.stream) {
              res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
              });

              if (lastMsg?.role === 'tool') {
                res.write(`data: ${JSON.stringify({
                  choices: [{ delta: { content: 'Verified tool execution via OpenAI-compatible endpoint.' }, finish_reason: 'stop' }],
                })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
                return;
              }

              // Check if tools requested
              if (parsed.tools && parsed.tools.length > 0) {
                res.write(`data: ${JSON.stringify({
                  choices: [{
                    delta: {
                      content: 'Calling tool via OpenAI-compatible endpoint...\n',
                      tool_calls: [{
                        index: 0,
                        id: 'call_openai_1',
                        type: 'function',
                        function: {
                          name: 'writeFile',
                          arguments: JSON.stringify({
                            path: 'openai_result.txt',
                            content: 'Generated via Custom OpenAI-compatible endpoint.',
                          }),
                        },
                      }],
                    },
                    finish_reason: null,
                  }],
                })}\n\n`);
                res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
                return;
              }

              // Simple streaming tokens
              res.write(`data: ${JSON.stringify({
                choices: [{ delta: { content: 'Hello from OpenAI-compatible endpoint! ' }, finish_reason: null }],
              })}\n\n`);
              res.write(`data: ${JSON.stringify({
                choices: [{ delta: { content: 'Streaming completed.' }, finish_reason: 'stop' }],
              })}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }

            // Non-streaming response
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              id: 'chatcmpl-mock-1',
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: parsed.model || 'custom-gpt-4o',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: `Processed request with model "${parsed.model}".`,
                  },
                  finish_reason: 'stop',
                },
              ],
              usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 },
            }));
          });
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      });

      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
