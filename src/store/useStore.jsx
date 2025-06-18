import { create } from 'zustand';

export const useKeycloakStore = create((set) => ({
  keycloakClient: null,
  setKeycloakClient: (val) => set({ keycloakClient: val }),
}));

export const useUserInfoStore = create((set) => ({
  userInfo: null,
  setUserInfo: (val) => set({ userInfo: val }),
}));

export const useUserVoipStore = create((set) => ({
  userVoip: null,
  setUserVoip: (val) => set({ userVoip: val }),
}));

export const useUserPageView = create((set) => ({
  userPageView: sessionStorage.getItem('current_page') ?? 'dashboard',
  setUserPageView: (val) => {
    set({ userPageView: val });
    sessionStorage.setItem('current_page', val)
  },
}));