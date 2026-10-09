import { ArrowDownToLine, ArrowRight, AudioLines, Check, Download, MonitorPlay, Shield, Sparkles, Users, Zap } from 'lucide-react';

const features = [
  { icon: Users, title: 'Topluluğun tek yerde', text: 'Sunucular, kanallar ve özel mesajlar arasında akıcı şekilde geçiş yap.' },
  { icon: AudioLines, title: 'Canlı ses ve ekran paylaşımı', text: 'Ekibinle konuş, ekranını paylaş ve birlikte çalış.' },
  { icon: Shield, title: 'Kontrol sende', text: 'Roller, izinler ve gizlilik tercihleri topluluğuna göre ayarlansın.' },
];

function launchApp() {
  const fallback = window.setTimeout(() => window.location.assign('/app'), 1100);
  window.addEventListener('blur', () => window.clearTimeout(fallback), { once: true });
  window.location.href = 'fastlynox://open';
}

export function MarketingLanding() {
  return <main className="relative h-screen overflow-x-hidden overflow-y-auto bg-[#080b11] text-white">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-18%,rgba(124,92,255,.27),transparent_54%),radial-gradient(ellipse_at_95%_72%,rgba(23,179,210,.12),transparent_32%)]" />
    <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
      <header className="flex h-[76px] items-center justify-between border-b border-white/[0.07]">
        <a href="/" className="flex items-center gap-2.5 text-sm font-bold tracking-wide"><img src="/favicon.svg" alt="" className="h-7 w-7" />Fastlynox</a>
        <nav className="flex items-center gap-2 sm:gap-3">
          <a href="https://github.com/Muffinsgram/FastlyNox/releases/latest" target="_blank" rel="noreferrer" className="hidden rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:bg-white/[0.06] hover:text-white sm:inline-flex">İndir</a>
          <button type="button" onClick={launchApp} className="inline-flex items-center gap-2 rounded-xl border border-violet-200/20 bg-white/[0.07] px-3.5 py-2.5 text-xs font-bold text-white shadow-[0_6px_24px_rgba(111,83,255,.12)] transition hover:border-violet-200/40 hover:bg-violet-300/10">Fastlynox’ı aç <ArrowRight className="h-3.5 w-3.5" /></button>
        </nav>
      </header>

      <section className="grid min-h-[min(720px,calc(100vh-77px))] items-center gap-12 py-16 lg:grid-cols-[1.02fr_.98fr] lg:py-20">
        <div className="max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-200/15 bg-violet-300/[0.07] px-3 py-1.5 text-[11px] font-semibold text-violet-100"><Sparkles className="h-3.5 w-3.5" /> Sohbetin, sesin ve topluluğun</div>
          <h1 className="text-5xl font-black leading-[1.04] tracking-[-.055em] sm:text-6xl xl:text-7xl">Bir araya gel.<br /><span className="bg-gradient-to-r from-violet-200 via-indigo-300 to-cyan-200 bg-clip-text text-transparent">Daha iyi iletişim kur.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">Fastlynox; arkadaşlarınla ve topluluğunla mesajlaşmak, sesli buluşmak ve fikirlerini paylaşmak için tasarlandı.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="https://github.com/Muffinsgram/FastlyNox/releases/latest" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-3.5 text-sm font-bold shadow-[0_12px_35px_rgba(102,83,255,.25)] transition hover:-translate-y-0.5 hover:brightness-110"><Download className="h-4 w-4" /> Masaüstü uygulamasını indir</a>
            <button type="button" onClick={launchApp} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-5 py-3.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"><MonitorPlay className="h-4 w-4" /> Tarayıcıda aç</button>
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-500"><Check className="h-3.5 w-3.5 text-emerald-300" /> Windows uygulaması · Ücretsiz başlangıç</p>
        </div>

        <div className="relative mx-auto w-full max-w-[600px]">
          <div aria-hidden="true" className="absolute -inset-10 rounded-[44px] bg-gradient-to-br from-violet-500/20 via-indigo-500/10 to-cyan-400/10 blur-3xl" />
          <div className="relative overflow-hidden rounded-[26px] border border-white/[0.12] bg-[#111620]/90 shadow-[0_34px_110px_rgba(0,0,0,.65)]">
            <div className="flex h-12 items-center gap-2 border-b border-white/[0.07] px-4"><img src="/favicon.svg" alt="" className="h-5 w-5" /><span className="text-[11px] font-bold text-slate-200">Fastlynox</span><span className="ml-auto flex gap-1.5"><i className="h-2 w-2 rounded-full bg-rose-400/80" /><i className="h-2 w-2 rounded-full bg-amber-300/80" /><i className="h-2 w-2 rounded-full bg-emerald-300/80" /></span></div>
            <div className="grid min-h-[330px] grid-cols-[120px_1fr] sm:grid-cols-[150px_1fr]">
              <aside className="border-r border-white/[0.06] bg-black/10 p-3"><div className="mb-4 rounded-lg bg-white/[0.07] px-2.5 py-2 text-[10px] font-bold text-slate-200">Arkadaşlar</div><p className="mb-2 px-2 text-[8px] font-bold tracking-widest text-slate-600">SUNUCULAR</p>{['Tasarım ekibi', 'Oyun gecesi', 'Kahve molası'].map((server, index) => <div key={server} className={`mb-1.5 flex items-center gap-2 rounded-lg px-2 py-2 text-[9px] font-semibold ${index === 0 ? 'bg-violet-400/15 text-violet-100' : 'text-slate-500'}`}><span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-violet-400/60 to-cyan-300/30">{server[0]}</span><span className="truncate">{server}</span></div>)}</aside>
              <div className="flex min-w-0 flex-col p-4 sm:p-5"><div className="mb-5 rounded-2xl border border-violet-200/10 bg-gradient-to-br from-violet-400/[0.12] to-transparent p-4"><p className="text-[10px] font-bold text-violet-100">✦ Hoş geldin!</p><p className="mt-1 text-[9px] text-slate-400">Topluluğa katıl, sohbete dahil ol.</p></div><div className="space-y-4">{[['Muffin', 'Toplantı notlarını kanala bıraktım 👋', 'from-orange-300 to-rose-400'], ['emirhan', 'Süper, birazdan bakıyorum!', 'from-cyan-300 to-blue-400'], ['Muffin', 'Akşam ses odasında buluşalım mı?', 'from-orange-300 to-rose-400']].map(([name, message, tone]) => <div key={message} className="flex gap-2.5"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br ${tone} text-[9px] font-black text-[#10141d]`}>{name[0]}</span><div className="min-w-0"><div className="text-[10px] font-bold text-slate-200">{name}<span className="ml-2 text-[8px] font-normal text-slate-600">şimdi</span></div><p className="mt-1 text-[9px] leading-4 text-slate-400">{message}</p></div></div>)}</div><div className="mt-auto flex items-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-[9px] text-slate-600"><Zap className="h-3.5 w-3.5 text-violet-300" /> Mesajını yaz…</div></div>
            </div>
          </div>
          <div className="absolute -bottom-5 -left-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-[#171d28]/95 px-3 py-2 shadow-2xl sm:-left-7"><span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200"><AudioLines className="h-4 w-4" /></span><span><span className="block text-[9px] font-bold text-white">Genel Oda</span><span className="mt-0.5 block text-[8px] text-emerald-200">Sesli sohbet aktif</span></span></div>
          <div className="absolute -right-3 -top-5 hidden items-center gap-2 rounded-2xl border border-white/10 bg-[#171d28]/95 px-3 py-2 shadow-2xl sm:flex"><span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-300/10 text-violet-200"><Users className="h-4 w-4" /></span><span className="text-[9px] font-bold text-white">Birlikte daha yakın</span></div>
        </div>
      </section>

      <section className="grid gap-3 border-t border-white/[0.07] py-10 sm:grid-cols-3">{features.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 transition hover:border-violet-200/15 hover:bg-white/[0.04]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-300/10 text-violet-200"><Icon className="h-4 w-4" /></span><h2 className="mt-4 text-sm font-bold">{title}</h2><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></article>)}</section>
      <footer className="flex flex-col gap-3 border-t border-white/[0.07] py-6 text-[10px] text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-center gap-2"><img src="/favicon.svg" alt="" className="h-4 w-4 opacity-70" /> Fastlynox · Birlikte daha iyi.</span><a href="https://github.com/Muffinsgram/FastlyNox/releases/latest" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-slate-300"><ArrowDownToLine className="h-3.5 w-3.5" /> Sürümleri ve indirmeleri gör</a></footer>
    </div>
  </main>;
}
