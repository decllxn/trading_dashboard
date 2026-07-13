import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  handleGetTrades,
  handleGetTradeStats,
  handleSearchJournal
} from '@/lib/copilot-db';

const INVOKE_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

export async function POST(req: Request) {
  // Authenticate user
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = user.id;

  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request: messages array is required' }, { status: 400 });
    }

    const apiKey = process.env.NVIDIA_API_KEY || process.env.NVIDIA_GLM_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'NVIDIA API key is not configured' }, { status: 500 });
    }

    // Build OpenAI-compatible chat completion payload
    const systemMessage = {
      role: 'system',
      content: `You are Antigravity Copilot, a premium AI assistant integrated into the user's trading dashboard. You have direct access to their trading log data, statistics, and journal entries.
Format your responses using clean Markdown. When referencing performance values:
- Use positive format like "+$1,234.50" or "+1.50R" and negative format like "-$543.21" or "-0.80R".
- Align statistics in structured tables or lists when comparing metrics.
- Keep responses concise, professional, and clear.`
    };

    // Keep system message at the beginning of the messages list.
    // Typed as any[] so tool-call messages (role: 'tool' with tool_call_id +
    // name) can be appended alongside the simpler role/content messages.
    let apiMessages: any[] = [systemMessage, ...messages.map((m: any) => ({
      role: m.role,
      content: m.content
    }))];

    // Define function declarations in OpenAI format
    const tools = [
      {
        type: 'function',
        function: {
          name: 'get_trade_stats',
          description: 'Returns trading performance statistics (win rate, profit factor, expectancy, average R-multiple, max drawdown, Sharpe, Sortino, total P&L, trade count) based on filters.',
          parameters: {
            type: 'object',
            properties: {
              assetClass: {
                type: 'string',
                description: "Filter by asset class ('equity', 'forex', 'futures', 'crypto', 'option')",
                enum: ['equity', 'forex', 'futures', 'crypto', 'option']
              },
              status: {
                type: 'string',
                description: "Filter by status ('open', 'closed')",
                enum: ['open', 'closed']
              },
              tag: {
                type: 'string',
                description: 'Filter by tag name (e.g. setups or emotion tags)'
              },
              fromDate: {
                type: 'string',
                description: 'Start date in YYYY-MM-DD format'
              },
              toDate: {
                type: 'string',
                description: 'End date in YYYY-MM-DD format'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_trades',
          description: 'Returns a filtered list of trades with details like instrument, asset class, P&L, R-multiple, entry/exit prices and times.',
          parameters: {
            type: 'object',
            properties: {
              assetClass: {
                type: 'string',
                description: "Filter by asset class ('equity', 'forex', 'futures', 'crypto', 'option')",
                enum: ['equity', 'forex', 'futures', 'crypto', 'option']
              },
              status: {
                type: 'string',
                description: "Filter by status ('open', 'closed')",
                enum: ['open', 'closed']
              },
              tag: {
                type: 'string',
                description: 'Filter by tag name'
              },
              fromDate: {
                type: 'string',
                description: 'Start date in YYYY-MM-DD format'
              },
              toDate: {
                type: 'string',
                description: 'End date in YYYY-MM-DD format'
              },
              limit: {
                type: 'integer',
                description: 'Number of trades to return (default 10, max 100)'
              }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_journal',
          description: 'Searches the user daily journal entries text content and mood tags for keywords or phrases.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query keyword or phrase'
              }
            },
            required: ['query']
          }
        }
      }
    ];

    let loop = true;
    let finalContent = '';
    let iterations = 0;
    const maxIterations = 8; // prevent infinite loops

    while (loop && iterations < maxIterations) {
      iterations++;

      const response = await fetch(INVOKE_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'z-ai/glm-5.2',
          messages: apiMessages,
          tools: tools,
          temperature: 0.1, // low temperature for consistent tool calling
          max_tokens: 4096
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`NVIDIA API error: ${response.status} ${response.statusText} - ${errText}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice) {
        throw new Error('NVIDIA API returned an empty choices array.');
      }

      const message = choice.message;
      const toolCalls = message?.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        // Append assistant's tool-call request message to the history
        apiMessages.push(message);

        // Execute each tool and append results as "tool" role messages
        for (const toolCall of toolCalls) {
          const { name, arguments: rawArgs } = toolCall.function;
          const callId = toolCall.id;
          
          let args = {};
          try {
            args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
          } catch (e) {
            console.warn(`Failed to parse arguments for tool ${name}:`, rawArgs);
          }

          let result;
          try {
            if (name === 'get_trade_stats') {
              result = await handleGetTradeStats(userId, args);
            } else if (name === 'get_trades') {
              result = await handleGetTrades(userId, args);
            } else if (name === 'search_journal') {
              result = await handleSearchJournal(userId, args);
            } else {
              result = { error: `Tool ${name} not found` };
            }
          } catch (err: any) {
            console.error(`Error executing tool ${name}:`, err);
            result = { error: err.message || 'Error executing database query' };
          }

          apiMessages.push({
            role: 'tool',
            tool_call_id: callId,
            name: name,
            content: JSON.stringify(result)
          });
        }
      } else {
        // No more tool calls; extract final text content
        finalContent = message?.content || '';
        loop = false;
      }
    }

    return NextResponse.json({ response: finalContent });
  } catch (err: any) {
    console.error('Error in Copilot API:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
