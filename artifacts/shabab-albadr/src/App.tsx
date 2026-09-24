import { type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getGetCompetitionDashboardQueryKey,
  getGetLeaderboardQueryKey,
  getListPlayersQueryKey,
  getListTeamsQueryKey,
  useGetCompetitionDashboard,
  useGetLeaderboard,
  useListMatches,
  useListPlayers,
  useListQuestions,
  useListTeams,
  useRecordCompetitionEvent,
  type Attack,
  type Match,
  type Player,
  type Question,
  type Team,
} from '@workspace/api-client-react';
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleHelp,
  ClipboardList,
  Clock3,
  Crown,
  Gauge,
  Home,
  Menu,
  Medal,
  MessageCircle,
  Network,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Star,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Route, Switch, Link, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

const navItems = [
  { href: '/', label: 'الميدان', icon: Home },
  { href: '/teams', label: 'الفرق', icon: Shield },
  { href: '/players', label: 'اللاعبون', icon: Users },
  { href: '/matches', label: 'المباريات', icon: CalendarDays },
  { href: '/questions', label: 'بنك التحدّي', icon: CircleHelp },
];

const categoryLabels: Record<string, string> = {
  new: 'حفظ جديد',
  repeat: 'مراجعة',
  challenge: 'تحدّي',
  attendance: 'حضور',
  online: 'أونلاين',
  special_task: 'مهمّة خاصة',
};

function teamColor(team?: Team, fallback = '#E9A43A') {
  return team?.color || fallback;
}

function teamById(teams: Team[] | undefined, id: number) {
  return teams?.find((team) => team.id === id);
}

function LoadingBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted/70 ${className}`} />;
}

function DataState({
  loading,
  error,
  empty,
  onRetry,
  children,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (loading) {
    return <div className="space-y-4"><LoadingBlock className="h-32" /><LoadingBlock className="h-64" /></div>;
  }
  if (error) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-destructive/20 bg-card p-8 text-center">
        <div className="mb-3 rounded-full bg-destructive/10 p-3 text-destructive"><RefreshCw size={21} /></div>
        <h3 className="font-bold">تعذّر تحميل البيانات</h3>
        <p className="mt-1 text-sm text-muted-foreground">تحقّق من الاتصال ثم حاول من جديد.</p>
        <button data-testid="button-retry-data" onClick={onRetry} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:opacity-90">
          <RefreshCw size={15} /> إعادة المحاولة
        </button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card p-8 text-center">
        <div className="mb-3 rounded-full bg-secondary p-3 text-secondary-foreground"><ClipboardList size={22} /></div>
        <h3 className="font-bold">لا توجد بيانات بعد</h3>
        <p className="mt-1 text-sm text-muted-foreground">ستظهر التفاصيل هنا مع انطلاق الموسم.</p>
      </div>
    );
  }
  return <>{children}</>;
}

function Brand() {
  return (
    <Link href="/" data-testid="link-brand" className="flex items-center gap-3">
      <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-accent text-primary shadow-[0_8px_24px_rgba(233,164,58,.22)]">
        <span className="absolute -right-2 -top-3 h-8 w-8 rounded-full border-2 border-primary/20" />
        <span className="relative text-lg font-bold">ب</span>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-wide">شباب البدر</div>
        <div className="mt-0.5 text-[10px] text-sidebar-foreground/55">دوري المسابقة</div>
      </div>
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 right-0 z-40 flex w-[258px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform duration-300 max-md:w-[286px] ${mobileOpen ? 'translate-x-0' : 'max-md:translate-x-full'}`}>
        <Brand />
        <div className="mt-9 border-y border-sidebar-border py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary/15 text-sidebar-primary"><Crown size={18} /></div>
            <div>
              <div className="text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/50">الموسم الحالي</div>
              <div className="mt-1 text-sm font-bold">رمضان ١٤٤٦</div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between text-[11px] text-sidebar-foreground/55">
            <span>الأسبوع ٧ من ١٢</span><span className="text-sidebar-primary">٥٨٪</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sidebar-accent"><div className="h-full w-[58%] rounded-full bg-sidebar-primary" /></div>
        </div>
        <nav className="mt-7 flex-1 space-y-1.5">
          <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-sidebar-foreground/35">لوحة القيادة</div>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? location === '/' : location.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                data-testid={`link-nav-${href === '/' ? 'dashboard' : href.slice(1)}`}
                onClick={() => setMobileOpen(false)}
                className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${active ? 'bg-sidebar-accent font-bold text-sidebar-primary shadow-inner' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}
              >
                <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
                <span>{label}</span>
                {active && <span className="mr-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
              </Link>
            );
          })}
        </nav>
        <div className="pitch-grid rounded-2xl border border-sidebar-border p-4">
          <div className="flex items-center gap-2 text-sidebar-primary"><Zap size={15} /><span className="text-xs font-bold">نبض المنافسة</span></div>
          <p className="mt-2 text-xs leading-6 text-sidebar-foreground/55">كل نقطة تُسجّل حكاية جديدة لفريقك.</p>
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-sidebar-border pt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">م</div>
          <div className="min-w-0"><div className="truncate text-xs font-bold">محمد العتيبي</div><div className="mt-0.5 text-[10px] text-sidebar-foreground/45">مدرّب المسابقة</div></div>
          <button data-testid="button-profile" className="mr-auto rounded-lg p-1.5 text-sidebar-foreground/40 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"><ArrowLeft size={15} /></button>
        </div>
      </aside>
      {mobileOpen && <button data-testid="button-close-mobile-nav" aria-label="إغلاق القائمة" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-primary/35 backdrop-blur-sm md:hidden" />}
      <main className="min-h-[100dvh] md:mr-[258px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-xl md:px-10">
          <div className="flex items-center gap-3">
            <button data-testid="button-open-mobile-nav" onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-muted-foreground hover:bg-muted md:hidden"><Menu size={20} /></button>
            <div className="md:hidden"><Brand /></div>
            <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex"><span>الموسم</span><ChevronLeft size={14} /><span className="font-bold text-foreground">رمضان ١٤٤٦</span></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground lg:flex"><Activity size={14} className="text-accent" /> آخر تحديث قبل ٣ دقائق</div>
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground"><MessageCircle size={17} /><span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-accent" /></div>
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-10 md:py-9">{children}</div>
      </main>
    </div>
  );
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div className="animate-rise">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-accent"><span className="h-px w-6 bg-accent" /> {eyebrow}</div>
        <h1 data-testid="text-page-title" className="text-3xl font-bold tracking-tight text-primary md:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function SectionHeading({ title, link, onClick }: { title: string; link?: string; onClick?: () => void }) {
  return <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-bold text-primary">{title}</h2>{link && <button data-testid={`button-section-${title}`} onClick={onClick} className="flex items-center gap-1 text-xs font-bold text-muted-foreground transition hover:text-primary">{link}<ChevronLeft size={14} /></button>}</div>;
}

function TeamMark({ team, size = 'md' }: { team?: Team; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'h-16 w-16 text-xl' : size === 'sm' ? 'h-8 w-8 text-[10px]' : 'h-11 w-11 text-sm';
  return <div className={`${dimensions} flex shrink-0 items-center justify-center rounded-2xl font-bold text-primary-foreground shadow-sm`} style={{ backgroundColor: teamColor(team) }}>{team?.shortName || '—'}</div>;
}

function MiniStat({ icon: Icon, label, value, tone = 'primary' }: { icon: typeof Trophy; label: string; value: ReactNode; tone?: 'primary' | 'accent' | 'mint' }) {
  const tones = { primary: 'bg-primary text-primary-foreground', accent: 'bg-accent text-primary', mint: 'bg-secondary text-secondary-foreground' };
  return <div className={`rounded-2xl p-4 ${tones[tone]}`}><div className="flex items-center justify-between text-xs opacity-70"><span>{label}</span><Icon size={15} /></div><div data-testid={`stat-${label}`} className="number-font mt-2 text-2xl font-bold">{value}</div></div>;
}

function CoachEventDialog({ player, players, onClose }: { player?: Player; players: Player[]; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState(player?.id || players[0]?.id || 0);
  const [category, setCategory] = useState('challenge');
  const [points, setPoints] = useState(5);
  const [reason, setReason] = useState('');
  const mutation = useRecordCompetitionEvent();
  const qc = useQueryClient();
  const selectedPlayer = players.find((item) => item.id === selectedId);
  const submit = () => {
    if (!selectedId || !reason.trim()) return;
    mutation.mutate({ data: { playerId: selectedId, category, points, reason: reason.trim() } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCompetitionDashboardQueryKey() });
        qc.invalidateQueries({ queryKey: getListPlayersQueryKey() });
        qc.invalidateQueries({ queryKey: getListTeamsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetLeaderboardQueryKey() });
        onClose();
      },
    });
  };
  if (!player && !players.length) return null;
  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-end justify-center bg-primary/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg animate-rise overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div><div className="mb-1 flex items-center gap-2 text-xs font-bold text-accent"><Zap size={14} /> لوحة المدرب</div><h2 className="text-xl font-bold text-primary">تسجيل حدث جديد</h2></div>
          <button data-testid="button-close-event-dialog" onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted"><X size={19} /></button>
        </div>
        <div className="space-y-5 p-6">
          <div>
            <label className="mb-2 block text-xs font-bold text-muted-foreground">اللاعب</label>
            <select data-testid="select-event-player" value={selectedId} onChange={(event) => setSelectedId(Number(event.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent">
              {players.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.teamName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-2 block text-xs font-bold text-muted-foreground">نوع الحدث</label><select data-testid="select-event-category" value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent">{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
            <div><label className="mb-2 block text-xs font-bold text-muted-foreground">النقاط</label><input data-testid="input-event-points" type="number" min={-10} max={20} value={points} onChange={(event) => setPoints(Number(event.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" /></div>
          </div>
          <div><label className="mb-2 block text-xs font-bold text-muted-foreground">وصف الحدث</label><textarea data-testid="input-event-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="مثال: أتمّ مراجعة الجزء المقرر بإتقان" rows={3} className="w-full resize-none rounded-xl border border-input bg-background px-3 py-3 text-sm leading-6 outline-none focus:border-accent" /></div>
          {selectedPlayer && <div className="flex items-center gap-3 rounded-2xl bg-secondary/70 p-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground">{selectedPlayer.avatarInitials}</div><div className="text-xs"><div className="font-bold">{selectedPlayer.name}</div><div className="mt-1 text-muted-foreground">التقييم الحالي {selectedPlayer.cardRating}</div></div><div className="mr-auto text-left"><div className="number-font text-lg font-bold text-secondary-foreground">{points > 0 ? `+${points}` : points}</div><div className="text-[10px] text-muted-foreground">نقطة</div></div></div>}
          <button data-testid="button-submit-event" disabled={mutation.isPending || !reason.trim() || !selectedId} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
            {mutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Check size={17} />} {mutation.isPending ? 'جارٍ الحفظ...' : 'اعتماد الحدث'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Standings({ teams = [] }: { teams?: Team[] }) {
  const ordered = [...teams].sort((a, b) => b.points - a.points);
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card">
      <div className="grid grid-cols-[32px_1fr_50px_50px_50px] items-center gap-2 border-b border-border bg-muted/40 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span>#</span><span>الفريق</span><span className="text-center">لعب</span><span className="text-center">فارق</span><span className="text-center">نقاط</span></div>
      <div className="divide-y divide-border/70">
        {ordered.map((team, index) => <div data-testid={`row-standing-${team.id}`} key={team.id} className="grid grid-cols-[32px_1fr_50px_50px_50px] items-center gap-2 px-4 py-3.5 transition hover:bg-muted/35"><span className={`number-font text-sm font-bold ${index === 0 ? 'text-accent' : 'text-muted-foreground'}`}>{String(index + 1).padStart(2, '0')}</span><div className="flex min-w-0 items-center gap-2.5"><TeamMark team={team} size="sm" /><span className="truncate text-sm font-bold">{team.name}</span></div><span className="number-font text-center text-sm text-muted-foreground">{team.wins + team.draws + team.losses}</span><span className="number-font text-center text-sm text-muted-foreground">{team.goalsFor - team.goalsAgainst > 0 ? '+' : ''}{team.goalsFor - team.goalsAgainst}</span><span data-testid={`text-team-points-${team.id}`} className="number-font text-center text-base font-bold text-primary">{team.points}</span></div>)}
      </div>
    </div>
  );
}

function DashboardPage({ openEvent }: { openEvent: (player?: Player) => void }) {
  const dashboardQuery = useGetCompetitionDashboard();
  const leaderboardQuery = useGetLeaderboard();
  const [, setLocation] = useLocation();
  const dashboard = dashboardQuery.data;
  const teams = dashboard?.teams || leaderboardQuery.data?.teams || [];
  return (
    <DataState loading={dashboardQuery.isLoading} error={dashboardQuery.isError} empty={!dashboard && !dashboardQuery.isLoading} onRetry={() => dashboardQuery.refetch()}>
      {dashboard && <div className="space-y-7">
        <div className="relative overflow-hidden rounded-[2rem] bg-primary px-6 py-7 text-primary-foreground shadow-xl shadow-primary/10 md:px-9 md:py-8">
          <div className="pitch-grid absolute inset-0 opacity-70" /><div className="absolute -left-16 -top-24 h-64 w-64 rounded-full border border-accent/15" /><div className="absolute -left-5 -top-14 h-44 w-44 rounded-full border border-accent/10" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="animate-rise"><div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[.16em] text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> الموسم على الهواء</div><h1 className="max-w-xl text-3xl font-bold leading-[1.35] md:text-5xl">المنافسة تُحسم<br /><span className="text-accent">بخطوة ثابتة.</span></h1><p className="mt-4 max-w-md text-sm leading-7 text-primary-foreground/65">{dashboard.seasonLabel} · الأسبوع {dashboard.completedWeeks} من {dashboard.totalWeeks}. كل تلاوة، كل إجابة، وكل حضور يصنع الفارق.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/matches" data-testid="link-hero-matches" className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-primary transition hover:-translate-y-0.5"><Trophy size={16} /> تابع الجولة</Link><button data-testid="button-hero-event" onClick={() => openEvent()} className="inline-flex items-center gap-2 rounded-xl border border-primary-foreground/20 px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary-foreground/10"><Plus size={16} /> سجّل نقطة</button></div></div>
            <div className="relative flex items-center gap-5 lg:pl-3"><div className="text-center"><div className="number-font text-6xl font-bold text-accent">{dashboard.completedWeeks}</div><div className="mt-1 text-xs text-primary-foreground/55">أسابيع مكتملة</div></div><div className="h-16 w-px bg-primary-foreground/15" /><div className="text-center"><div className="number-font text-6xl font-bold">{dashboard.activePlayers}</div><div className="mt-1 text-xs text-primary-foreground/55">لاعب نشط</div></div></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStat icon={Users} label="إجمالي الطلاب" value={dashboard.totalStudents} tone="mint" /><MiniStat icon={Zap} label="اللاعبون النشطون" value={dashboard.activePlayers} tone="accent" /><MiniStat icon={Trophy} label="الفرق" value={teams.length || 4} tone="primary" /><MiniStat icon={Gauge} label="الجولة القادمة" value="الخميس" tone="mint" />
        </div>
        <div className="grid gap-7 xl:grid-cols-[1.15fr_.85fr]">
          <section><SectionHeading title="ترتيب الميدان" link="كل الفرق" onClick={() => setLocation('/teams')} /><Standings teams={teams} /></section>
          <section><SectionHeading title="الجلسة القادمة" link="عرض المباريات" onClick={() => setLocation('/matches')} /><div className="relative overflow-hidden rounded-3xl bg-secondary p-6"><div className="absolute -left-10 -top-10 h-36 w-36 rounded-full border border-secondary-foreground/10" /><div className="relative"><div className="flex items-center justify-between"><span className="rounded-full bg-card/70 px-3 py-1 text-[11px] font-bold text-secondary-foreground">بعد يومين</span><CalendarDays size={19} className="text-secondary-foreground" /></div><h3 className="mt-7 text-2xl font-bold text-secondary-foreground">{dashboard.nextSessionLabel}</h3><p className="mt-2 text-sm text-secondary-foreground/65">{dashboard.nextSessionDate}</p><div className="mt-6 flex items-center gap-3 border-t border-secondary-foreground/10 pt-4 text-xs text-secondary-foreground/70"><Clock3 size={15} /> جهّز فريقك للجولة الرابعة</div></div></div></section>
        </div>
        <div className="grid gap-7 xl:grid-cols-[.8fr_1.2fr]">
          <section><SectionHeading title="لاعب الأسبوع" link="ملف اللاعبين" onClick={() => setLocation('/players')} /><div className="relative overflow-hidden rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border"><div className="absolute left-0 top-0 h-full w-1.5 bg-accent" /><div className="flex items-center gap-4"><div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-accent">{dashboard.featuredPlayer.avatarInitials}<div className="absolute -bottom-2 -left-2 flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-primary"><Star size={13} fill="currentColor" /></div></div><div><div className="text-lg font-bold">{dashboard.featuredPlayer.name}</div><div className="mt-1 text-xs text-muted-foreground">{dashboard.featuredPlayer.teamName} · {dashboard.featuredPlayer.role}</div></div><div className="mr-auto text-left"><div className="number-font text-2xl font-bold text-primary">{dashboard.featuredPlayer.cardRating}</div><div className="text-[10px] text-muted-foreground">التقييم</div></div></div><div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4"><div><div className="number-font font-bold">{dashboard.featuredPlayer.stats.total}</div><div className="mt-1 text-[10px] text-muted-foreground">إجمالي النقاط</div></div><div><div className="number-font font-bold">{dashboard.featuredPlayer.stats.challengePoints}</div><div className="mt-1 text-[10px] text-muted-foreground">تحدّيات</div></div><button data-testid="button-featured-event" onClick={() => openEvent(dashboard.featuredPlayer)} className="flex items-center justify-center gap-1 rounded-lg bg-muted text-xs font-bold transition hover:bg-accent"><Plus size={13} /> حدث</button></div></div></section>
          <section><SectionHeading title="آخر المستجدات" /><div className="rounded-3xl border border-border bg-card p-5">{dashboard.recentActivity?.length ? <div className="space-y-4">{dashboard.recentActivity.slice(0, 4).map((item) => <div data-testid={`activity-item-${item.id}`} key={item.id} className="flex gap-3"><div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${item.type === 'score' ? 'bg-accent/20 text-accent-foreground' : 'bg-secondary text-secondary-foreground'}`}>{item.type === 'score' ? <Zap size={14} /> : <Activity size={14} />}</div><div className="min-w-0 flex-1"><div className="text-sm font-bold">{item.title}</div><div className="mt-0.5 truncate text-xs text-muted-foreground">{item.description}</div></div><span className="shrink-0 text-[10px] text-muted-foreground">{item.timeLabel}</span></div>)}</div> : <p className="py-5 text-center text-sm text-muted-foreground">لم تُسجّل أحداث بعد.</p>}</div></section>
        </div>
      </div>}
    </DataState>
  );
}

function TeamsPage() {
  const query = useListTeams();
  const playersQuery = useListPlayers();
  const teams = query.data || [];
  return <DataState loading={query.isLoading} error={query.isError} empty={!teams.length} onRetry={() => query.refetch()}><div className="space-y-7"><PageIntro eyebrow="الأندية الأربعة" title="الفرق" description="أربع رايات، ٢٤ لاعباً، وموسم واحد يُكتب أسبوعاً بعد أسبوع." /><div className="grid gap-5 md:grid-cols-2">{teams.map((team, index) => { const roster = (playersQuery.data || []).filter((player) => player.teamId === team.id); return <div data-testid={`card-team-${team.id}`} key={team.id} className="group relative overflow-hidden rounded-3xl border border-border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl"><div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: teamColor(team) }} /><div className="flex items-start justify-between"><div className="flex items-center gap-4"><TeamMark team={team} size="lg" /><div><div className="text-xl font-bold">{team.name}</div><div className="mt-1 text-xs text-muted-foreground">بقيادة {team.coach}</div></div></div><div className="rounded-xl bg-muted px-3 py-2 text-center"><div className="number-font text-xl font-bold">{String(index + 1).padStart(2, '0')}</div><div className="text-[9px] text-muted-foreground">الترتيب</div></div></div><div className="mt-6 grid grid-cols-4 divide-x divide-border border-y border-border py-4 text-center"><div><div className="number-font text-lg font-bold text-primary">{team.points}</div><div className="text-[10px] text-muted-foreground">نقطة</div></div><div><div className="number-font text-lg font-bold">{team.wins}</div><div className="text-[10px] text-muted-foreground">فوز</div></div><div><div className="number-font text-lg font-bold">{team.goalsFor}</div><div className="text-[10px] text-muted-foreground">له</div></div><div><div className="number-font text-lg font-bold">{team.playerCount}</div><div className="text-[10px] text-muted-foreground">لاعبون</div></div></div><div className="mt-4 rounded-2xl bg-muted/45 p-3"><div className="mb-2 text-[10px] font-bold text-muted-foreground">قائمة الفريق</div><div className="flex items-center gap-1.5">{roster.slice(0, 6).map((player) => <div data-testid={`roster-player-${player.id}`} key={player.id} title={player.name} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[9px] font-bold text-accent">{player.avatarInitials}</div>)}<span className="mr-1 text-[10px] text-muted-foreground">{roster.length || team.playerCount} لاعبين</span></div></div><div className="mt-4 flex items-center justify-between text-xs"><span className="text-muted-foreground">القائد <b className="mr-1 text-foreground">{team.captainName}</b></span><span className="flex items-center gap-1 font-bold" style={{ color: teamColor(team) }}><Shield size={13} /> {team.assistantCoach}</span></div></div>; })}</div></div></DataState>;
}

function PlayerCard({ player, teams, onEvent }: { player: Player; teams?: Team[]; onEvent: (player: Player) => void }) {
  const team = teamById(teams, player.teamId);
  return <div data-testid={`card-player-${player.id}`} className="group relative overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-lg transition duration-300 hover:-translate-y-1 hover:shadow-xl"><div className="absolute -left-10 -top-10 h-36 w-36 rounded-full border border-accent/15" /><div className="relative flex items-start justify-between"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-base font-bold text-primary">{player.avatarInitials}</div><div><div className="font-bold">{player.name}</div><div className="mt-1 text-[11px] text-primary-foreground/55">{player.teamName} · {player.role}</div></div></div><div className="text-center"><div className="number-font text-2xl font-bold text-accent">{player.cardRating}</div><div className="text-[9px] text-primary-foreground/55">التقييم</div></div></div><div className="relative mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-primary-foreground/8 p-3 text-center"><div><div className="number-font text-lg font-bold">{player.stats.total}</div><div className="text-[9px] text-primary-foreground/50">المجموع</div></div><div><div className="number-font text-lg font-bold">{player.stats.challengePoints}</div><div className="text-[9px] text-primary-foreground/50">تحدّي</div></div><div><div className="number-font text-lg font-bold">{player.stats.attendancePoints}</div><div className="text-[9px] text-primary-foreground/50">حضور</div></div></div><div className="relative mt-3 grid grid-cols-4 gap-1 rounded-xl bg-primary-foreground/5 px-2 py-2 text-center"><div><div className="number-font text-xs font-bold">{player.stats.newPoints}</div><div className="text-[8px] text-primary-foreground/45">جديد</div></div><div><div className="number-font text-xs font-bold">{player.stats.repeatPoints}</div><div className="text-[8px] text-primary-foreground/45">مراجعة</div></div><div><div className="number-font text-xs font-bold">{player.stats.onlinePoints}</div><div className="text-[8px] text-primary-foreground/45">أونلاين</div></div><div><div className="number-font text-xs font-bold">{player.stats.specialTaskPoints}</div><div className="text-[8px] text-primary-foreground/45">خاص</div></div></div><div className="relative mt-4 flex items-center justify-between"><span className="flex items-center gap-1 text-[10px] text-primary-foreground/55">{player.stats.manOfMatch && <><Medal size={13} className="text-accent" /> رجل الجولة</>}</span><button data-testid={`button-record-player-event-${player.id}`} onClick={() => onEvent(player)} className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-bold text-primary transition hover:bg-accent/85"><Plus size={13} /> تسجيل حدث</button></div></div>;
}

function PlayersPage({ openEvent }: { openEvent: (player?: Player) => void }) {
  const playersQuery = useListPlayers();
  const teamsQuery = useListTeams();
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const players = playersQuery.data || [];
  const filtered = useMemo(() => players.filter((player) => (teamFilter === 'all' || String(player.teamId) === teamFilter) && player.name.includes(search)), [players, search, teamFilter]);
  return <DataState loading={playersQuery.isLoading} error={playersQuery.isError} empty={!players.length} onRetry={() => playersQuery.refetch()}><div className="space-y-7"><PageIntro eyebrow="بطاقات اللاعبين" title="اللاعبون" description="كل لاعب يحمل بطاقة أداء تتطور مع كل جولة وكل نقطة." action={<button data-testid="button-open-event-players" onClick={() => openEvent()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5"><Plus size={16} /> تسجيل حدث</button>} /><div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row"><div className="relative flex-1"><Search size={16} className="absolute right-3 top-3 text-muted-foreground" /><input data-testid="input-search-players" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن لاعب..." className="w-full rounded-xl bg-muted/50 py-2.5 pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-accent/40" /></div><select data-testid="select-filter-team" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none"><option value="all">كل الفرق</option>{(teamsQuery.data || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((player) => <PlayerCard key={player.id} player={player} teams={teamsQuery.data} onEvent={openEvent} />)}</div>{!filtered.length && <div className="rounded-3xl bg-card p-10 text-center text-sm text-muted-foreground">لا يوجد لاعب يطابق البحث.</div>}</div></DataState>;
}

function AttackSteps({ attacks, homeId, awayId, homeShort, awayShort }: { attacks: Attack[]; homeId: number; awayId: number; homeShort: string; awayShort: string }) {
  return <div className="grid gap-2 sm:grid-cols-4">{attacks.map((attack, index) => <div data-testid={`attack-${attack.id}`} key={attack.id} className={`relative rounded-2xl border p-3 ${attack.status === 'completed' ? 'border-accent/30 bg-accent/10' : attack.status === 'live' ? 'border-secondary-foreground/30 bg-secondary' : 'border-border bg-muted/30'}`}><div className="flex items-center justify-between"><span className="number-font text-xs font-bold text-muted-foreground">٠{index + 1}</span>{attack.status === 'completed' ? <Check size={14} className="text-secondary-foreground" /> : attack.status === 'live' ? <span className="h-2 w-2 animate-pulse rounded-full bg-secondary-foreground" /> : <Clock3 size={13} className="text-muted-foreground" />}</div><div className="mt-3 text-xs font-bold">{attack.label}</div><div className="mt-1 text-[10px] leading-5 text-muted-foreground">{attack.description}</div>{attack.winnerTeamId && <div className="mt-2 text-[10px] font-bold text-secondary-foreground">{attack.winnerTeamId === homeId ? homeShort : awayShort} يحسم المرحلة</div>}</div>)}</div>;
}

function MatchCard({ match, teams }: { match: Match; teams?: Team[] }) {
  const home = teamById(teams, match.homeTeamId);
  const away = teamById(teams, match.awayTeamId);
  const live = match.status === 'live';
  return <div data-testid={`card-match-${match.id}`} className="rounded-3xl border border-border bg-card p-5 transition hover:shadow-lg"><div className="flex items-center justify-between text-xs"><span className={`flex items-center gap-2 font-bold ${live ? 'text-destructive' : 'text-muted-foreground'}`}>{live && <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />}{live ? 'مباشر الآن' : match.status === 'completed' ? 'انتهت' : 'قادمة'}</span><span className="text-muted-foreground">الأسبوع {match.week} · {match.dateLabel}</span></div><div className="my-6 flex items-center justify-center gap-7 sm:gap-16"><div className="flex w-20 flex-col items-center gap-2 text-center"><TeamMark team={home} /><span className="text-xs font-bold">{match.homeTeamName}</span></div><div className="text-center"><div className="number-font text-3xl font-bold text-primary">{match.homeScore} <span className="mx-1 text-muted-foreground">—</span> {match.awayScore}</div><div className="mt-1 text-[10px] text-muted-foreground">النتيجة الحالية</div></div><div className="flex w-20 flex-col items-center gap-2 text-center"><TeamMark team={away} /><span className="text-xs font-bold">{match.awayTeamName}</span></div></div><AttackSteps attacks={match.attacks} homeId={match.homeTeamId} awayId={match.awayTeamId} homeShort={match.homeTeamShortName} awayShort={match.awayTeamShortName} /></div>;
}

function MatchesPage() {
  const matchesQuery = useListMatches();
  const teamsQuery = useListTeams();
  const matches = matchesQuery.data || [];
  return <DataState loading={matchesQuery.isLoading} error={matchesQuery.isError} empty={!matches.length} onRetry={() => matchesQuery.refetch()}><div className="space-y-7"><PageIntro eyebrow="موسم على شكل مباراة" title="المباريات" description="كل أسبوع يحمل أربع مراحل هجومية. تابع لحظة الحسم، ثم شاهد أثرها على جدول الترتيب." /><div className="flex items-center justify-between rounded-2xl bg-primary px-5 py-4 text-primary-foreground"><div className="flex items-center gap-3"><div className="rounded-xl bg-accent p-2 text-primary"><Network size={17} /></div><div><div className="text-sm font-bold">نظام الهجمات الأربع</div><div className="mt-1 text-[11px] text-primary-foreground/55">قرآن · حفظ · أونلاين · مهمّة خاصة</div></div></div><Link href="/questions" data-testid="link-matches-questions" className="text-xs font-bold text-accent">بنك الأسئلة <ArrowLeft size={14} className="mr-1 inline" /></Link></div><div className="space-y-4">{matches.map((match) => <MatchCard key={match.id} match={match} teams={teamsQuery.data} />)}</div></div></DataState>;
}

function QuestionsPage() {
  const query = useListQuestions();
  const [category, setCategory] = useState('all');
  const questions = query.data || [];
  const categories = [...new Set(questions.map((question) => question.category))];
  const visible = questions.filter((question) => category === 'all' || question.category === category);
  return <DataState loading={query.isLoading} error={query.isError} empty={!questions.length} onRetry={() => query.refetch()}><div className="space-y-7"><PageIntro eyebrow="Challenge 30" title="بنك التحدّي" description="أسئلة مختارة بعناية، بدرجات متفاوتة، لتبقى المنافسة عادلة وممتعة." action={<div className="flex items-center gap-2 rounded-xl bg-accent/20 px-3 py-2 text-xs font-bold text-accent-foreground"><CircleHelp size={16} /> {questions.length} سؤال</div>} /><div className="flex flex-wrap gap-2"><button data-testid="button-filter-questions-all" onClick={() => setCategory('all')} className={`rounded-xl px-4 py-2 text-xs font-bold transition ${category === 'all' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground ring-1 ring-border hover:bg-muted'}`}>الكل</button>{categories.map((item) => <button data-testid={`button-filter-question-${item}`} key={item} onClick={() => setCategory(item)} className={`rounded-xl px-4 py-2 text-xs font-bold transition ${category === item ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground ring-1 ring-border hover:bg-muted'}`}>{categoryLabels[item] || item}</button>)}</div><div className="grid gap-4 lg:grid-cols-2">{visible.map((question: Question, index) => <div data-testid={`card-question-${question.id}`} key={question.id} className="group rounded-3xl border border-border bg-card p-5 transition hover:border-accent/50 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-2"><span className="number-font flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-xs font-bold text-accent">{String(index + 1).padStart(2, '0')}</span><span className="rounded-lg bg-secondary px-2.5 py-1 text-[10px] font-bold text-secondary-foreground">{categoryLabels[question.category] || question.category}</span></div><span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${question.difficulty === 'hard' ? 'bg-destructive/10 text-destructive' : question.difficulty === 'medium' ? 'bg-accent/20 text-accent-foreground' : 'bg-secondary text-secondary-foreground'}`}>{question.difficulty === 'hard' ? 'متقدم' : question.difficulty === 'medium' ? 'متوسط' : 'مبتدئ'}</span></div><p className="mt-5 text-sm font-bold leading-7 text-primary">{question.prompt}</p><div className="mt-5 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Target size={14} /> سؤال التحدّي</span><span className="number-font font-bold text-accent-foreground">{question.points} نقاط</span></div></div>)}</div></div></DataState>;
}

function Router() {
  const [location] = useLocation();
  const [eventPlayer, setEventPlayer] = useState<Player>();
  const [eventOpen, setEventOpen] = useState(false);
  const playersQuery = useListPlayers();
  const openEvent = (player?: Player) => { setEventPlayer(player); setEventOpen(true); };
  return <Shell><ErrorBoundary resetKey={location}><Switch><Route path="/"><DashboardPage openEvent={openEvent} /></Route><Route path="/teams"><TeamsPage /></Route><Route path="/players"><PlayersPage openEvent={openEvent} /></Route><Route path="/matches"><MatchesPage /></Route><Route path="/questions"><QuestionsPage /></Route><Route component={NotFound} /></Switch></ErrorBoundary>{eventOpen ? <CoachEventDialog player={eventPlayer} players={playersQuery.data || []} onClose={() => { setEventOpen(false); setEventPlayer(undefined); }} /> : null}</Shell>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><Router /><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;