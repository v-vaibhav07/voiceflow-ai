/**
 * Conversation Controller
 */

const { db } = require('../config/supabase');

class ConversationController {
  constructor({ supabase }) {
    this.supabase = supabase;
  }

  /**
   * GET /api/conversations
   */
  list = async (req, res, next) => {
    try {
      const userId = req.query.userId || null;
      if (!this.supabase) return res.json({ conversations: [] });

      let query = this.supabase
        .from('conversations')
        .select('id, title, status, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (userId) query = query.eq('user_id', userId);

      const { data, error } = await query;
      if (error) throw error;
      res.json({ conversations: data || [] });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/conversations/:id
   */
  get = async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!this.supabase) return res.json({ conversation: null });

      const { data: conversation, error: convErr } = await this.supabase
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();

      if (convErr) throw convErr;

      const { data: messages } = await this.supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', id)
        .order('sequence_number', { ascending: true });

      const { data: interruptions } = await this.supabase
        .from('interruptions')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      const { data: toolCalls } = await this.supabase
        .from('tool_calls')
        .select('*')
        .eq('conversation_id', id)
        .order('started_at', { ascending: true });

      const { data: voiceEvents } = await this.supabase
        .from('voice_events')
        .select('*')
        .eq('conversation_id', id)
        .order('timestamp', { ascending: true })
        .limit(500);

      res.json({
        conversation,
        messages: messages || [],
        interruptions: interruptions || [],
        toolCalls: toolCalls || [],
        voiceEvents: voiceEvents || [],
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/conversations
   */
  create = async (req, res, next) => {
    try {
      const { userId, title } = req.body || {};
      const conv = await db.createConversation(this.supabase, userId || null, title || 'New Conversation');
      res.status(201).json({ conversation: conv });
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/conversations/:id
   */
  remove = async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!this.supabase) return res.status(204).end();
      const { error } = await this.supabase.from('conversations').delete().eq('id', id);
      if (error) throw error;
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { ConversationController };