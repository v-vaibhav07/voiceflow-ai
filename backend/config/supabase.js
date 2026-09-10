/**
 * Supabase client configuration
 */

const { createClient } = require('@supabase/supabase-js');

let supabaseClient = null;

function getSupabase(config) {
  if (supabaseClient) return supabaseClient;

  if (!config?.supabase?.url || !config?.supabase?.anonKey) {
    console.warn('⚠️  Supabase not configured. Database features will be unavailable.');
    return null;
  }

  supabaseClient = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey || config.supabase.anonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  return supabaseClient;
}

/**
 * Database helper functions
 */
const db = {
  async createConversation(supabase, userId, title = 'New Conversation') {
    if (!supabase) return { id: require('uuid').v4() };

    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: userId, title })
      .select()
      .single();

    if (error) {
      console.error('DB: Error creating conversation:', error.message);
      throw error;
    }
    return data;
  },

  async addMessage(supabase, message) {
    if (!supabase) return { id: require('uuid').v4(), ...message };

    const { data, error } = await supabase
      .from('messages')
      .insert(message)
      .select()
      .single();

    if (error) {
      console.error('DB: Error adding message:', error.message);
      throw error;
    }
    return data;
  },

  async updateMessage(supabase, messageId, updates) {
    if (!supabase) return { id: messageId, ...updates };

    const { data, error } = await supabase
      .from('messages')
      .update(updates)
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      console.error('DB: Error updating message:', error.message);
      throw error;
    }
    return data;
  },

  async addVoiceEvent(supabase, event) {
    if (!supabase) return { id: require('uuid').v4(), ...event };

    const { data, error } = await supabase
      .from('voice_events')
      .insert(event)
      .select()
      .single();

    if (error) {
      console.error('DB: Error adding voice event:', error.message);
    }
    return data;
  },

  async addInterruption(supabase, interruption) {
    if (!supabase) return { id: require('uuid').v4(), ...interruption };

    const { data, error } = await supabase
      .from('interruptions')
      .insert(interruption)
      .select()
      .single();

    if (error) {
      console.error('DB: Error adding interruption:', error.message);
    }
    return data;
  },

  async updateInterruption(supabase, interruptionId, updates) {
    if (!supabase) return { id: interruptionId, ...updates };

    const { data, error } = await supabase
      .from('interruptions')
      .update(updates)
      .eq('id', interruptionId)
      .select()
      .single();

    if (error) {
      console.error('DB: Error updating interruption:', error.message);
    }
    return data;
  },

  async addToolCall(supabase, toolCall) {
    if (!supabase) return { id: require('uuid').v4(), ...toolCall };

    const { data, error } = await supabase
      .from('tool_calls')
      .insert(toolCall)
      .select()
      .single();

    if (error) {
      console.error('DB: Error adding tool call:', error.message);
    }
    return data;
  },

  async updateToolCall(supabase, toolCallId, updates) {
    if (!supabase) return { id: toolCallId, ...updates };

    const { data, error } = await supabase
      .from('tool_calls')
      .update(updates)
      .eq('id', toolCallId)
      .select()
      .single();

    if (error) {
      console.error('DB: Error updating tool call:', error.message);
    }
    return data;
  },

  async getConversation(supabase, conversationId) {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('conversations')
      .select('*, messages(*, tool_calls:tool_calls(*))')
      .eq('id', conversationId)
      .order('sequence_number', { referencedTable: 'messages', ascending: true })
      .single();

    if (error) {
      console.error('DB: Error getting conversation:', error.message);
      return null;
    }
    return data;
  },

  async getConversations(supabase, userId, limit = 20) {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('conversations')
      .select('id, title, status, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('DB: Error getting conversations:', error.message);
      return [];
    }
    return data;
  },

  async addEvaluationRun(supabase, run) {
    if (!supabase) return { id: require('uuid').v4(), ...run };

    const { data, error } = await supabase
      .from('evaluation_runs')
      .insert(run)
      .select()
      .single();

    if (error) {
      console.error('DB: Error adding evaluation run:', error.message);
    }
    return data;
  },

  async addEvaluationResult(supabase, result) {
    if (!supabase) return { id: require('uuid').v4(), ...result };

    const { data, error } = await supabase
      .from('evaluation_results')
      .insert(result)
      .select()
      .single();

    if (error) {
      console.error('DB: Error adding evaluation result:', error.message);
    }
    return data;
  },

  async getEvaluationRuns(supabase, limit = 20) {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('evaluation_runs')
      .select('*, evaluation_results(*)')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('DB: Error getting evaluation runs:', error.message);
      return [];
    }
    return data;
  },

  async getInterruptions(supabase, conversationId) {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('interruptions')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('DB: Error getting interruptions:', error.message);
      return [];
    }
    return data;
  },
};

module.exports = { getSupabase, db };