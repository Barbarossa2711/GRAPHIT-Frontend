/**
 * Command IDs.
 *
 * Commands are the interface between the two widgets: the chat lives in its own React
 * root and cannot reach into the main widget, but it can execute a command.
 */

export namespace CommandIDs {
  export const openMain = 'graphit:open-main';
  export const openChat = 'graphit:open-chat';
  export const closeChat = 'graphit:close-chat';
  export const showSidebar = 'graphit:show-sidebar';
  export const restoreSidebar = 'graphit:restore-sidebar';
  export const select = 'graphit:select';
  export const startQuiz = 'graphit:start-quiz';
  export const reviewSession = 'graphit:review-session';
  export const refreshProgress = 'graphit:refresh-progress';
  export const startTour = 'graphit:start-tour';
}

export const PLUGIN_ID_CORE = 'graphit-jupyter:core';
export const PLUGIN_ID_MAIN = 'graphit-jupyter:main';
export const PLUGIN_ID_CHAT = 'graphit-jupyter:chat';
