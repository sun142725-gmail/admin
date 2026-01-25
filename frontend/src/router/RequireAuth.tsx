// 路由守卫确保登录后访问受保护页面。
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { profile as fetchProfile } from '../api/auth';
import { clearTokens, setProfile } from '../store/authSlice';

export const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) =>
  {
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const token = useAppSelector((state) => state.auth.accessToken);

    useEffect(() => {
      if (!token) {
        navigate('/login');
        return;
      }
      fetchProfile()
        .then((data) => dispatch(setProfile(data)))
        .catch(() => {
          dispatch(clearTokens());
          navigate('/login');
        });
    }, [dispatch, navigate, token]);

    return children;
  };
