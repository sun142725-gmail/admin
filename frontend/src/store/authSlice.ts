// 鉴权状态用于管理 token 与用户信息。
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  profile: {
    id: number;
    username: string;
    nickname?: string;
    email?: string;
    permissions: string[];
    roles: string[];
  } | null;
}

const initialState: AuthState = {
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  profile: null
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setTokens(state, action: PayloadAction<{ accessToken: string; refreshToken: string }>) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      localStorage.setItem('accessToken', action.payload.accessToken);
      localStorage.setItem('refreshToken', action.payload.refreshToken);
    },
    clearTokens(state) {
      state.accessToken = null;
      state.refreshToken = null;
      state.profile = null;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    },
    setProfile(state, action: PayloadAction<AuthState['profile']>) {
      state.profile = action.payload;
    }
  }
});

export const { setTokens, clearTokens, setProfile } = authSlice.actions;
export default authSlice.reducer;
