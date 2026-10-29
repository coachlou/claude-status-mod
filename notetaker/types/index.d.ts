export type NotetakerText = string
/** 'chat': a file per conversation. 'thread': one file continued across conversations. */
export type NotetakerMode = 'chat' | 'thread'
/** Which file the pane shows. */
export type NotetakerView = 'notes' | 'insights'

declare module 'claude-code' {
  interface PluginState {
    notetaker: {
      notes: NotetakerText
      insights: NotetakerText
      file: NotetakerText
      pending: NotetakerText
      mode: NotetakerMode
      view: NotetakerView
      isNewChat: boolean
      sinceSynth: number
    }
  }
}
