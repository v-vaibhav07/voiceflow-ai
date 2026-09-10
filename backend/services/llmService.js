// /**
//  * LLM Service (OpenAI)
//  *
//  * Handles all LLM interactions with abortable requests.
//  */

// const axios = require('axios');
// const fs = require('fs');
// const path = require('path');
// const { LatencyTimer } = require('../utils/latencyUtils');
// const logger = require('../utils/logger');

// const SYSTEM_PROMPT_PATH = path.join(__dirname, '..', '..', 'voice', 'prompts', 'system-prompt.txt');

// let cachedSystemPrompt = null;
// function loadSystemPrompt() {
//   if (cachedSystemPrompt) return cachedSystemPrompt;
//   try {
//     cachedSystemPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf8');
//   } catch {
//     cachedSystemPrompt =
//       'You are VoiceFlow, a helpful voice assistant. Keep responses concise and natural for text-to-speech.';
//   }
//   return cachedSystemPrompt;
// }

// const TOOL_DEFINITIONS = [
//   {
//     type: 'function',
//     function: {
//       name: 'search_flights',
//       description: 'Search for flights between two cities on a given date.',
//       parameters: {
//         type: 'object',
//         properties: {
//           from: { type: 'string', description: 'Departure city' },
//           to: { type: 'string', description: 'Arrival city' },
//           date: { type: 'string', description: 'Date (e.g., "tomorrow", "2024-12-25")' },
//           time_of_day: {
//             type: 'string',
//             enum: ['any', 'morning', 'afternoon', 'evening', 'night'],
//             description: 'Preferred time of day',
//           },
//         },
//         required: ['from', 'to', 'date'],
//       },
//     },
//   },
// ];

// class LLMService {
//   constructor(config) {
//     this.config = config;
//     this.log = logger.child({ service: 'llm' });
//     this.endpoint = 'https://api.openai.com/v1/chat/completions';
//     this.timeout = 30000;
//   }

//   /**
//    * Get a chat completion from OpenAI.
//    *
//    * @param {Array} messages - Conversation history
//    * @param {object} options - { signal, generation, tools }
//    */
//   async chat(messages, options = {}) {
//     const { signal, generation = null, tools = TOOL_DEFINITIONS } = options;

//     if (!this.config.openai.apiKey) {
//       throw new Error('OPENAI_API_KEY not configured');
//     }

//     const timer = new LatencyTimer('llm_chat').start();

//     const body = {
//       model: this.config.openai.model,
//       messages: [{ role: 'system', content: loadSystemPrompt() }, ...messages],
//       max_tokens: this.config.openai.maxTokens,
//       temperature: 0.7,
//     };

//     if (tools && tools.length > 0) {
//       body.tools = tools;
//       body.tool_choice = 'auto';
//     }

//     this.log.info('LLM request started', {
//       messageCount: messages.length,
//       model: body.model,
//       generation,
//     });

//     try {
//       const response = await axios.post(this.endpoint, body, {
//         headers: {
//           Authorization: `Bearer ${this.config.openai.apiKey}`,
//           'Content-Type': 'application/json',
//         },
//         timeout: this.timeout,
//         signal,
//       });

//       const latencyMs = timer.stop();
//       const choice = response.data.choices[0];
//       const message = choice.message;

//       this.log.info('LLM request completed', {
//         latencyMs: Math.round(latencyMs),
//         finishReason: choice.finish_reason,
//         hasToolCalls: !!message.tool_calls,
//         generation,
//       });

//       return {
//         text: message.content || '',
//         toolCalls: message.tool_calls || [],
//         finishReason: choice.finish_reason,
//         latencyMs: Math.round(latencyMs),
//         usage: response.data.usage,
//         generation,
//       };
//     } catch (error) {
//       if (axios.isCancel(error) || error.name === 'AbortError' || error.name === 'CanceledError') {
//         this.log.info('LLM request cancelled', { generation });
//         throw new Error('LLM request cancelled');
//       }
//       this.log.error('LLM request failed', {
//         error: error.message,
//         status: error.response?.status,
//         generation,
//       });
//       throw error;
//     }
//   }

//   getToolDefinitions() {
//     return TOOL_DEFINITIONS;
//   }
// }

// module.exports = { LLMService };










// /**
//  * LLM Service (OpenRouter)
//  *
//  * Handles all LLM interactions with abortable requests.
//  * OpenRouter provides an OpenAI-compatible Chat Completions API.
//  */

// const axios = require('axios');
// const fs = require('fs');
// const path = require('path');
// const { LatencyTimer } = require('../utils/latencyUtils');
// const logger = require('../utils/logger');

// const SYSTEM_PROMPT_PATH = path.join(
//   __dirname,
//   '..',
//   '..',
//   'voice',
//   'prompts',
//   'system-prompt.txt'
// );

// let cachedSystemPrompt = null;

// /**
//  * Load the system prompt once and cache it.
//  */
// function loadSystemPrompt() {
//   if (cachedSystemPrompt) {
//     return cachedSystemPrompt;
//   }

//   try {
//     cachedSystemPrompt = fs.readFileSync(
//       SYSTEM_PROMPT_PATH,
//       'utf8'
//     ).trim();
//   } catch (error) {
//     cachedSystemPrompt =
//       'You are VoiceFlow, a helpful voice assistant. Keep responses concise and natural for text-to-speech.';
//   }

//   return cachedSystemPrompt;
// }

// /**
//  * Tool definitions available to the LLM.
//  */
// const TOOL_DEFINITIONS = [
//   {
//     type: 'function',
//     function: {
//       name: 'search_flights',
//       description:
//         'Search for flights between two cities on a given date.',
//       parameters: {
//         type: 'object',
//         properties: {
//           from: {
//             type: 'string',
//             description: 'Departure city',
//           },
//           to: {
//             type: 'string',
//             description: 'Arrival city',
//           },
//           date: {
//             type: 'string',
//             description:
//               'Date (e.g., "tomorrow", "2024-12-25")',
//           },
//           time_of_day: {
//             type: 'string',
//             enum: [
//               'any',
//               'morning',
//               'afternoon',
//               'evening',
//               'night',
//             ],
//             description: 'Preferred time of day',
//           },
//         },
//         required: ['from', 'to', 'date'],
//       },
//     },
//   },
// ];

// class LLMService {
//   constructor(config) {
//     this.config = config;
//     this.log = logger.child({ service: 'llm' });

//     // OpenRouter endpoint from environment configuration.
//     this.endpoint = `${config.openrouter.baseUrl.replace(
//       /\/+$/,
//       ''
//     )}/chat/completions`;

//     this.timeout = 30000;
//   }

//   /**
//    * Get a chat completion from OpenRouter.
//    *
//    * @param {Array} messages - Conversation history
//    * @param {object} options - { signal, generation, tools }
//    * @returns {Promise<object>}
//    */
//   async chat(messages, options = {}) {
//     const {
//       signal,
//       generation = null,
//       tools = TOOL_DEFINITIONS,
//     } = options;

//     const openrouter = this.config.openrouter;

//     // Validate OpenRouter configuration.
//     if (!openrouter?.apiKey) {
//       throw new Error(
//         'OPENROUTER_API_KEY not configured'
//       );
//     }

//     if (!openrouter?.baseUrl) {
//       throw new Error(
//         'OPENROUTER_BASE_URL not configured'
//       );
//     }

//     if (!openrouter?.model) {
//       throw new Error(
//         'OPENROUTER_MODEL not configured'
//       );
//     }

//     const timer = new LatencyTimer('llm_chat').start();

//     const body = {
//       model: openrouter.model,
//       messages: [
//         {
//           role: 'system',
//           content: loadSystemPrompt(),
//         },
//         ...messages,
//       ],
//       max_tokens: openrouter.maxTokens,
//       temperature: 0.7,
//     };

//     // Add tools only when available.
//     if (tools && tools.length > 0) {
//       body.tools = tools;
//       body.tool_choice = 'auto';
//     }

//     this.log.info('LLM request started', {
//       messageCount: messages.length,
//       model: body.model,
//       generation,
//     });

//     try {
//       const response = await axios.post(
//         this.endpoint,
//         body,
//         {
//           headers: {
//             Authorization: `Bearer ${openrouter.apiKey}`,
//             'Content-Type': 'application/json',

//             // OpenRouter recommended attribution headers.
//             ...(openrouter.siteUrl
//               ? {
//                   'HTTP-Referer':
//                     openrouter.siteUrl,
//                 }
//               : {}),

//             ...(openrouter.siteName
//               ? {
//                   'X-Title':
//                     openrouter.siteName,
//                 }
//               : {}),
//           },

//           timeout: this.timeout,
//           signal,
//         }
//       );

//       const latencyMs = timer.stop();

//       // Validate response structure.
//       if (
//         !response.data ||
//         !Array.isArray(response.data.choices) ||
//         response.data.choices.length === 0
//       ) {
//         throw new Error(
//           'OpenRouter returned an invalid response'
//         );
//       }

//       const choice = response.data.choices[0];
//       const message = choice.message || {};

//       this.log.info('LLM request completed', {
//         latencyMs: Math.round(latencyMs),
//         finishReason: choice.finish_reason,
//         hasToolCalls:
//           Array.isArray(message.tool_calls) &&
//           message.tool_calls.length > 0,
//         generation,
//       });

//       return {
//         text: message.content || '',
//         toolCalls: message.tool_calls || [],
//         finishReason: choice.finish_reason,
//         latencyMs: Math.round(latencyMs),
//         usage: response.data.usage,
//         generation,
//       };
//     } catch (error) {
//       // Request was intentionally cancelled.
//       if (
//         axios.isCancel(error) ||
//         error.name === 'AbortError' ||
//         error.name === 'CanceledError'
//       ) {
//         this.log.info(
//           'LLM request cancelled',
//           { generation }
//         );

//         throw new Error(
//           'LLM request cancelled'
//         );
//       }

//       // Log useful API error information without logging
//       // the API key.
//       this.log.error('LLM request failed', {
//         error: error.message,
//         status: error.response?.status,
//         providerError:
//           error.response?.data?.error?.message ||
//           error.response?.data?.error ||
//           null,
//         generation,
//       });

//       throw error;
//     }
//   }

//   /**
//    * Return available tool definitions.
//    */
//   getToolDefinitions() {
//     return TOOL_DEFINITIONS;
//   }
// }

// module.exports = {
//   LLMService,
// };



























/**
 * LLM Service (OpenRouter)
 *
 * Handles all LLM interactions with abortable requests.
 * OpenRouter provides an OpenAI-compatible Chat Completions API.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const { LatencyTimer } = require('../utils/latencyUtils');
const logger = require('../utils/logger');

const SYSTEM_PROMPT_PATH = path.join(
  __dirname,
  '..',
  '..',
  'voice',
  'prompts',
  'system-prompt.txt'
);

let cachedSystemPrompt = null;

/**
 * Load the system prompt once and cache it.
 */
function loadSystemPrompt() {
  if (cachedSystemPrompt) {
    return cachedSystemPrompt;
  }

  try {
    cachedSystemPrompt = fs
      .readFileSync(SYSTEM_PROMPT_PATH, 'utf8')
      .trim();
  } catch (error) {
    cachedSystemPrompt =
      'You are VoiceFlow, a helpful voice assistant. Keep responses concise and natural for text-to-speech.';
  }

  return cachedSystemPrompt;
}

/**
 * Tool definitions available to the LLM.
 */
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_flights',
      description:
        'Search for flights between two cities on a given date.',
      parameters: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: 'Departure city',
          },
          to: {
            type: 'string',
            description: 'Arrival city',
          },
          date: {
            type: 'string',
            description:
              'Date (e.g., "tomorrow", "2024-12-25")',
          },
          time_of_day: {
            type: 'string',
            enum: [
              'any',
              'morning',
              'afternoon',
              'evening',
              'night',
            ],
            description: 'Preferred time of day',
          },
        },
        required: ['from', 'to', 'date'],
      },
    },
  },
];

class LLMService {
  constructor(config) {
    this.config = config;
    this.log = logger.child({ service: 'llm' });

    const baseUrl = config?.openrouter?.baseUrl || '';

    this.endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    /*
     * Keep a reasonable timeout.
     * AbortController cancellation is still handled independently.
     */
    this.timeout = 30000;
  }

  /**
   * Get a chat completion from OpenRouter.
   *
   * @param {Array} messages - Conversation history
   * @param {object} options
   * @param {AbortSignal} options.signal
   * @param {string|number|null} options.generation
   * @param {Array|null} options.tools
   *
   * @returns {Promise<object>}
   */
  async chat(messages, options = {}) {
    const {
      signal,
      generation = null,
      tools = TOOL_DEFINITIONS,
    } = options;

    const openrouter = this.config?.openrouter;

    /**
     * Validate configuration before making a network request.
     */
    if (!openrouter?.apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY not configured'
      );
    }

    if (!openrouter?.baseUrl) {
      throw new Error(
        'OPENROUTER_BASE_URL not configured'
      );
    }

    if (!openrouter?.model) {
      throw new Error(
        'OPENROUTER_MODEL not configured'
      );
    }

    /**
     * Do not start a request that has already been cancelled.
     */
    if (signal?.aborted) {
      this.log.info(
        'LLM request skipped — generation already aborted',
        { generation }
      );

      throw new Error(
        'LLM request cancelled'
      );
    }

    const timer =
      new LatencyTimer('llm_chat').start();

    /**
     * Always keep the system prompt first.
     */
    const requestMessages = [
      {
        role: 'system',
        content: loadSystemPrompt(),
      },
      ...(Array.isArray(messages) ? messages : []),
    ];

    const body = {
      model: openrouter.model,
      messages: requestMessages,

      /**
       * Use the configured token limit.
       */
      max_tokens:
        Number(openrouter.maxTokens) || 500,

      /**
       * Slightly conservative temperature for
       * predictable voice responses.
       */
      temperature: 0.7,
    };

    /**
     * Only send tools when tools are actually available.
     *
     * The second LLM call from orchestration passes
     * tools: [] so that the model produces the final
     * natural-language answer instead of another tool call.
     */
    if (Array.isArray(tools) && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    this.log.info(
      'LLM request started',
      {
        messageCount: requestMessages.length,
        model: body.model,
        generation,
        hasTools:
          Array.isArray(tools) &&
          tools.length > 0,
      }
    );

    try {
      const response = await axios.post(
        this.endpoint,
        body,
        {
          headers: {
            Authorization:
              `Bearer ${openrouter.apiKey}`,

            'Content-Type':
              'application/json',

            /**
             * OpenRouter attribution headers.
             */
            ...(openrouter.siteUrl
              ? {
                  'HTTP-Referer':
                    openrouter.siteUrl,
                }
              : {}),

            ...(openrouter.siteName
              ? {
                  'X-Title':
                    openrouter.siteName,
                }
              : {}),
          },

          timeout: this.timeout,
          signal,

          /**
           * Only successful HTTP responses should
           * reach the normal response handling.
           */
          validateStatus: (status) =>
            status >= 200 && status < 300,
        }
      );

      const latencyMs =
        Math.round(timer.stop());

      /**
       * Validate OpenRouter response.
       */
      if (
        !response.data ||
        !Array.isArray(response.data.choices) ||
        response.data.choices.length === 0
      ) {
        throw new Error(
          'OpenRouter returned an invalid response'
        );
      }

      const choice =
        response.data.choices[0] || {};

      const message =
        choice.message || {};

      /**
       * Normalize tool calls.
       */
      const toolCalls =
        Array.isArray(message.tool_calls)
          ? message.tool_calls
          : [];

      /**
       * Normalize text.
       *
       * Some providers can return null content when
       * the response contains tool calls.
       */
      const text =
        typeof message.content === 'string'
          ? message.content.trim()
          : '';

      this.log.info(
        'LLM request completed',
        {
          latencyMs,
          finishReason:
            choice.finish_reason || null,

          hasToolCalls:
            toolCalls.length > 0,

          textLength:
            text.length,

          generation,
        }
      );

      return {
        text,
        toolCalls,
        finishReason:
          choice.finish_reason || null,

        latencyMs,

        usage:
          response.data.usage || null,

        generation,
      };
    } catch (error) {
      /**
       * Abort/cancellation handling.
       *
       * This exact error string is intentionally preserved
       * because OrchestrationService uses it to identify
       * cancelled generations.
       */
      if (
        axios.isCancel(error) ||
        error?.name === 'AbortError' ||
        error?.name === 'CanceledError' ||
        error?.code === 'ERR_CANCELED' ||
        signal?.aborted
      ) {
        this.log.info(
          'LLM request cancelled',
          { generation }
        );

        throw new Error(
          'LLM request cancelled'
        );
      }

      /**
       * Capture useful API information without
       * exposing the OpenRouter API key.
       */
      const status =
        error.response?.status || null;

      const providerError =
        error.response?.data?.error?.message ||
        error.response?.data?.error ||
        null;

      this.log.error(
        'LLM request failed',
        {
          error:
            error.message,

          status,

          providerError,

          generation,
        }
      );

      throw error;
    }
  }

  /**
   * Return available tool definitions.
   */
  getToolDefinitions() {
    return TOOL_DEFINITIONS;
  }
}

module.exports = {
  LLMService,
};