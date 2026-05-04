'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface UserInfo {
  id: string;
  name: string;
  loginTime: number; // 登录时间戳
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserInfo | null;
  login: (key: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_KEY = 'scrm_auth_user';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8小时（毫秒）

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem(AUTH_KEY);
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        // 检查是否超过8小时
        if (parsed.loginTime && Date.now() - parsed.loginTime < SESSION_DURATION) {
          setUser(parsed);
        } else {
          // 已过期，清除登录状态
          localStorage.removeItem(AUTH_KEY);
        }
      } catch {
        localStorage.removeItem(AUTH_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (key: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        const userInfo: UserInfo = {
          ...data.data,
          loginTime: Date.now()
        };
        setUser(userInfo);
        localStorage.setItem(AUTH_KEY, JSON.stringify(userInfo));
        return { success: true };
      } else {
        return { success: false, error: data.error || '登录失败' };
      }
    } catch {
      return { success: false, error: '网络错误，请重试' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(AUTH_KEY);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ 
      isAuthenticated: !!user, 
      user,
      login, 
      logout 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
