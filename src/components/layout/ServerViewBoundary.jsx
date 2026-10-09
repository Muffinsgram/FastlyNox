import React from 'react';

export class ServerViewBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Sunucu görünümü açılamadı:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <main role="alert" className="flex min-w-0 flex-1 items-center justify-center bg-[#0b0e14] p-6"><section className="w-full max-w-lg rounded-[28px] border border-rose-200/10 bg-[#121722] p-7 text-center shadow-2xl"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-rose-300/[0.08] text-rose-200">!</div><h1 className="text-base font-bold text-white">Sunucu görünümü açılamadı</h1><p className="mt-2 text-xs leading-5 text-slate-400">Ekranın boş kalmaması için hata yakalandı. Yeniden deneyebilir veya mesajlara dönebilirsin.</p><details className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-left"><summary className="cursor-pointer text-[10px] font-semibold text-slate-400">Hata ayrıntısı</summary><pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] text-rose-200/80">{String(this.state.error?.message || this.state.error)}</pre></details><div className="mt-5 flex justify-center gap-2"><button type="button" onClick={() => this.setState({ error: null })} className="rounded-xl bg-violet-400 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-300">Yeniden dene</button><button type="button" onClick={this.props.onBack} className="rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]">Mesajlara dön</button></div></section></main>;
    }
    return this.props.children;
  }
}
