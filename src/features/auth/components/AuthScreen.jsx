import React, { useRef, useState } from 'react';
import { Zap, MessageSquare, AtSign, Mail, Lock, ArrowRight } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

export function AuthScreen() {
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  
  const [islandState, setIslandState] = useState('default'); // default, alert, loading
  const [islandMessage, setIslandMessage] = useState('');
  const alertTimeout = useRef(null);

  const showIslandAlert = (msg, duration = 4000) => {
    clearTimeout(alertTimeout.current);
    setIslandMessage(msg);
    setIslandState('alert');
    alertTimeout.current = setTimeout(() => setIslandState('default'), duration);
  };

  const showIslandLoading = (msg) => {
    setIslandMessage(msg);
    setIslandState('loading');
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    showIslandLoading(authMode === 'login' ? "Giriş yapılıyor..." : "Hesabın hazırlanıyor...");
    
    try {
      if (authMode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username: username.trim() } },
        });
        if (error) {
          showIslandAlert(error.message);
        } else if (!data.session) {
          showIslandAlert('Check your email to confirm your account.');
          setAuthMode('login');
        } else {
          showIslandAlert('Account created. Signing you in…', 2000);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) showIslandAlert('Sign-in failed. Check your email and password.');
      }
    } catch {
      showIslandAlert('Could not reach the authentication service. Try again.');
    }
  };

  const handlePasswordReset = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      showIslandAlert('Enter your email address first.');
      return;
    }
    showIslandLoading('Sending password reset instructions…');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      showIslandAlert('If an account uses that address, reset instructions are on the way.');
    } catch {
      showIslandAlert('Could not send reset instructions. Try again later.');
    }
  };

  return (
    <div className="macos-auth w-full h-full bg-fastcord-bg flex items-center justify-center relative overflow-hidden" style={{WebkitAppRegion: 'drag'}}>
      {/* Animated Background Mesh */}
      <div className="bg-mesh pointer-events-none fixed inset-0 z-0 bg-gradient-to-br from-[#080B10] to-[#121620]">
          <div className="blob-1 absolute -top-[10%] -left-[10%] w-[50vw] h-[50vw] rounded-full" style={{background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, rgba(0,0,0,0) 70%)'}}></div>
          <div className="blob-2 absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full" style={{background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, rgba(0,0,0,0) 70%)'}}></div>
      </div>
      
      <div className="w-full max-w-md relative mt-6 z-10" style={{WebkitAppRegion: 'no-drag'}}>
          {/* Dynamic Island */}
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-50 flex justify-center">
              <div className={`dynamic-island backdrop-blur-xl ${islandState === 'default' ? 'island-default' : 'island-expanded'} ${islandState === 'alert' ? 'border-cyan-500/30' : islandState === 'loading' ? 'border-violet-500/30' : ''}`}>
                  <div className={`island-content text-sm font-medium ${islandState === 'default' ? 'active' : 'inactive'}`}>
                      <span>Hoş Geldin</span><span className="text-xs">👋</span>
                  </div>
                  <div className={`island-content text-sm ${islandState === 'alert' ? 'active' : 'inactive'}`}>
                      <MessageSquare className="w-4 h-4 text-cyan-400" />
                      <span className="text-slate-200">{islandMessage}</span>
                  </div>
                  <div className={`island-content text-sm font-medium text-violet-300 ${islandState === 'loading' ? 'active' : 'inactive'}`}>
                      <div className="spinner border-violet-500/30 border-t-violet-400"></div>
                      <span>{islandMessage}</span>
                  </div>
              </div>
          </div>

          {/* Soft Glass Window */}
          <div className="glass-panel relative z-10 flex flex-col transition-all duration-700 min-h-[520px]">
              <div className="flex-1 flex flex-col relative z-10">
                  
                  {/* Header & Tabs */}
                  <div className="pt-14 px-8 pb-4 text-center">
                      <h1 className="text-2xl font-semibold text-white/90 mb-1 tracking-tight transition-opacity duration-300">
                        {authMode === 'login' ? "Fastlynox'a Giriş Yap" : "Yerini Kap"}
                      </h1>
                      <p className="text-sm text-slate-400/80 mb-6 transition-opacity duration-300">
                        {authMode === 'login' ? "Ekip seni bekliyor, geç kalma." : "Aramıza katılmak sadece birkaç saniye."}
                      </p>

                      <div className="relative bg-black/30 rounded-2xl p-1 flex items-center mb-4 mx-auto w-full max-w-[280px]">
                          <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white/10 backdrop-blur-md rounded-xl shadow-sm border border-white/10 transition-transform duration-500 cubic-bezier(0.16, 1, 0.3, 1) z-0 ${authMode === 'register' ? 'translate-x-full' : 'translate-x-0'}`}></div>
                          
                          <button onClick={() => setAuthMode('login')} className={`flex-1 relative z-10 py-2 text-sm font-medium transition-colors ${authMode === 'login' ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}>Giriş</button>
                          <button onClick={() => setAuthMode('register')} className={`flex-1 relative z-10 py-2 text-sm font-medium transition-colors ${authMode === 'register' ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}>Kayıt</button>
                      </div>
                  </div>

                  {/* Forms Container */}
                  <div className="relative flex-1 overflow-hidden pb-4">
                      <div className="form-slider-container h-full" style={{ transform: authMode === 'login' ? 'translateX(0)' : 'translateX(-50%)' }}>
                          
                          {/* LOGIN */}
                          <div className={`form-panel flex flex-col ${authMode === 'login' ? 'form-visible' : 'form-hidden'}`}>
                              <form onSubmit={handleAuth} className="flex flex-col gap-4 flex-1">
                                  <div className="relative group">
                                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Mail className="h-4 w-4 text-slate-400 group-focus-within:text-violet-400 transition-colors" /></div>
                                      <input type="email" autoComplete="email" aria-label="Email address" value={email} onChange={e => setEmail(e.target.value)} required className="glass-input w-full py-3.5 pl-11 pr-4 text-sm text-white placeholder-slate-500/70" placeholder="E-posta Adresi" />
                                  </div>
                                  <div className="relative group">
                                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock className="h-4 w-4 text-slate-400 group-focus-within:text-violet-400 transition-colors" /></div>
                                      <input type="password" autoComplete="current-password" aria-label="Password" value={password} onChange={e => setPassword(e.target.value)} required className="glass-input w-full py-3.5 pl-11 pr-11 text-sm text-white placeholder-slate-500/70" placeholder="Şifren (En az 6 haneli)" />
                                  </div>
                                  <div className="flex items-center justify-between px-1">
                                      <span className="text-xs text-slate-500">Your session stays signed in on this device.</span>
                                      <a href="#reset-password" onClick={handlePasswordReset} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">Şifremi Unuttum</a>
                                  </div>
                                  <div className="mt-auto pt-6">
                                      <button type="submit" className="btn-gradient w-full py-3.5 text-white font-medium text-sm flex items-center justify-center gap-2 group">
                                          <span>Giriş Yap ve Başla</span><ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                      </button>
                                  </div>
                              </form>
                          </div>

                          {/* REGISTER */}
                          <div className={`form-panel flex flex-col ${authMode === 'register' ? 'form-visible' : 'form-hidden'}`}>
                              <form onSubmit={handleAuth} className="flex flex-col gap-4 flex-1">
                                  <div className="relative group">
                                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><AtSign className="h-4 w-4 text-slate-400 group-focus-within:text-cyan-400 transition-colors" /></div>
                                      <input type="text" autoComplete="username" aria-label="Username" maxLength={32} value={username} onChange={e => setUsername(e.target.value)} required className="glass-input w-full py-3.5 pl-11 pr-4 text-sm text-white placeholder-slate-500/70" placeholder="Kullanıcı Adın (Örn: Hyperion)" />
                                  </div>
                                  <div className="relative group">
                                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Mail className="h-4 w-4 text-slate-400 group-focus-within:text-cyan-400 transition-colors" /></div>
                                      <input type="email" autoComplete="email" aria-label="Email address" value={email} onChange={e => setEmail(e.target.value)} required className="glass-input w-full py-3.5 pl-11 pr-4 text-sm text-white placeholder-slate-500/70" placeholder="E-posta Adresin" />
                                  </div>
                                  <div className="relative group">
                                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock className="h-4 w-4 text-slate-400 group-focus-within:text-cyan-400 transition-colors" /></div>
                                      <input type="password" autoComplete="new-password" aria-label="Password" minLength={6} value={password} onChange={e => setPassword(e.target.value)} required className="glass-input w-full py-3.5 pl-11 pr-11 text-sm text-white placeholder-slate-500/70" placeholder="Güçlü Bir Şifre Belirle" />
                                  </div>
                                  <div className="mt-auto pt-4">
                                      <button type="submit" className="btn-gradient w-full py-3.5 text-white font-medium text-sm flex items-center justify-center gap-2 group">
                                          <span>Sıraya Katıl</span><Zap className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                      </button>
                                  </div>
                              </form>
                          </div>

                      </div>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
}
