import { create } from 'zustand'

interface SettingsState {
  upbitConfigured: boolean
  okxConfigured: boolean
  telegramEnabled: boolean
  discordEnabled: boolean
  setUpbitConfigured: (v: boolean) => void
  setOkxConfigured: (v: boolean) => void
  setTelegramEnabled: (v: boolean) => void
  setDiscordEnabled: (v: boolean) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  upbitConfigured: false,
  okxConfigured: false,
  telegramEnabled: false,
  discordEnabled: false,
  setUpbitConfigured: (v) => set({ upbitConfigured: v }),
  setOkxConfigured: (v) => set({ okxConfigured: v }),
  setTelegramEnabled: (v) => set({ telegramEnabled: v }),
  setDiscordEnabled: (v) => set({ discordEnabled: v }),
}))
