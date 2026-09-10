const express = require('express');

function conversationRoutes(conversationController) {
  const router = express.Router();
  router.get('/', conversationController.list);
  router.post('/', conversationController.create);
  router.get('/:id', conversationController.get);
  router.delete('/:id', conversationController.remove);
  return router;
}

module.exports = { conversationRoutes };