/** Events the server listens for. */
export const CLIENT_EVENTS = {
  JOIN_CONVERSATION: 'joinConversation',
  LEAVE_CONVERSATION: 'leaveConversation',
  SEND_MESSAGE: 'sendMessage',
  TYPING: 'typing',
  STOP_TYPING: 'stopTyping',
  MESSAGE_READ: 'messageRead',
} as const;

/** Events the server emits. */
export const SERVER_EVENTS = {
  NEW_MESSAGE: 'newMessage',
  TYPING: 'typing',
  STOP_TYPING: 'stopTyping',
  MESSAGE_READ: 'messageRead',
  USER_ONLINE: 'userOnline',
  USER_OFFLINE: 'userOffline',
  NOTIFICATION: 'notification',
  JOINED_CONVERSATION: 'joinedConversation',
  LEFT_CONVERSATION: 'leftConversation',
  ERROR: 'error',
} as const;

/** Room naming. Rooms are the unit of authorisation for broadcasts. */
export const rooms = {
  user: (userId: string) => `user:${userId}`,
  conversation: (conversationId: string) => `conversation:${conversationId}`,
};
