import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import {
  getGetCompetitionDashboardQueryKey,
  getGetLeaderboardQueryKey,
  getListMatchesQueryKey,
  getListPlayersQueryKey,
  getListQuestionsQueryKey,
  getListTeamsQueryKey,
  useCreateQuestion,
  useGetCompetitionDashboard,
  useGetLeaderboard,
  useListMatches,
  useListPlayers,
  useListQuestions,
  useListTeams,
  useLogin,
  useGetPlayerCard,
  useGetSettings,
  useUpdateSettings,
  useCreateMatch,
  useUpdateMatch,
  useDeleteMatch,
  useRecordCompetitionEvent,
  useUpdatePlayer,
  useUpdateTeam,
  setAuthTokenGetter,
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
  Pencil,
  Plus,
  RefreshCw,
  ArrowRightLeft,
  LogIn,
  LogOut,
  QrCode,
  Lock,
  ShieldCheck,
  Trash2,
  Search,
  Shield,
  Star,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { Route, Switch, Link, useLocation, useRoute } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

// --- Trainer authentication --------------------------------------------------

const AUTH_KEY = 'shabab-albadr-auth';
type AuthState = { token: string; name: string; username: string; role: 'admin' | 'coach'; teamId: number | null } | null;

function readStoredAuth(): AuthState {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    return null;
  }
}

// Module-level token so the API fetch layer can attach the Bearer header.
let currentToken: string | null = readStoredAuth()?.token ?? null;
setAuthTokenGetter(() => currentToken);

const AuthContext = createContext<{
  auth: AuthState;
  login: (state: NonNullable<AuthState>) => void;
  logout: () => void;
}>({ auth: null, login: () => {}, logout: () => {} });

function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(() => readStoredAuth());
  useEffect(() => {
    currentToken = auth?.token ?? null;
    try {
      if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
      else localStorage.removeItem(AUTH_KEY);
    } catch {
      /* ignore storage errors */
    }
  }, [auth]);
  return (
    <AuthContext.Provider value={{ auth, login: setAuth, logout: () => setAuth(null) }}>
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return useContext(AuthContext);
}

function LoginDialog({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const mutation = useLogin();
  const { login } = useAuth();
  const submit = () => {
    if (!username.trim() || !pin.trim()) return;
    mutation.mutate(
      { data: { username: username.trim(), pin: pin.trim() } },
      { onSuccess: (data) => { login(data); onClose(); } },
    );
  };
  return (
    <div dir="rtl" className="fixed inset-0 z-[60] flex items-end justify-center bg-primary/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-sm animate-rise overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold text-accent"><Lock size={14} /> دخول المدرّب</div>
            <h2 className="text-xl font-bold text-primary">تسجيل الدخول</h2>
          </div>
          <button data-testid="button-close-login" onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted"><X size={19} /></button>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="mb-2 block text-xs font-bold text-muted-foreground">اسم المستخدم</label>
            <input data-testid="input-login-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold text-muted-foreground">الرقم السري</label>
            <input data-testid="input-login-pin" type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoComplete="current-password" className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" />
          </div>
          {mutation.isError && <p className="text-xs font-bold text-destructive">اسم المستخدم أو الرقم السري غير صحيح.</p>}
          <button data-testid="button-submit-login" disabled={mutation.isPending || !username.trim() || !pin.trim()} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
            {mutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <LogIn size={17} />} {mutation.isPending ? 'جارٍ الدخول...' : 'دخول'}
          </button>
        </div>
      </div>
    </div>
  );
}

// QR codes point at the public URL stored in the sheet's Settings tab, so the app
// can move to another host without touching code. Falls back to the current origin.
function publicBaseUrl(publicUrl?: string) {
  const url = (publicUrl || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(url) ? url : window.location.origin;
}

// Printed QR codes encode this stable redirect page (the public shabab-albadr-go repo on
// GitHub Pages), which forwards to the live app address in that repo's config.json.
const QR_REDIRECT_BASE = 'https://mahmoudde.github.io/shabab-albadr-go/';
const qrLink = (token: string) => `${QR_REDIRECT_BASE}?t=${encodeURIComponent(token)}`;

function QrDialog({ player, onClose }: { player: Player; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState('');
  const settingsQuery = useGetSettings();
  const cardUrl = `${publicBaseUrl(settingsQuery.data?.publicUrl)}/card/${player.cardToken}`;
  const stableUrl = qrLink(player.cardToken);
  useEffect(() => {
    QRCode.toDataURL(stableUrl, { width: 1024, margin: 2 }).then(setDataUrl).catch(() => setDataUrl(''));
  }, [stableUrl]);
  return (
    <div dir="rtl" className="fixed inset-0 z-[60] flex items-center justify-center bg-primary/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs animate-rise overflow-hidden rounded-3xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold text-primary">بطاقة {player.name}</h2>
          <button data-testid="button-close-qr" onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          {dataUrl ? <img src={dataUrl} alt="QR" className="h-56 w-56 rounded-2xl border border-border" /> : <div className="h-56 w-56 animate-pulse rounded-2xl bg-muted" />}
          <p className="text-[11px] leading-5 text-muted-foreground">امسح الرمز لعرض البطاقة الافتراضية للاعب.</p>
          <a data-testid="link-card-url" href={cardUrl} target="_blank" rel="noreferrer" className="break-all text-[10px] text-accent-foreground underline">{cardUrl}</a>
          <button onClick={() => window.print()} className="mt-1 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground transition hover:bg-accent hover:text-primary"><QrCode size={13} /> طباعة</button>
        </div>
      </div>
    </div>
  );
}

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

// Live date label (Hijri, Arabic) — recomputed on each render so it changes daily.
function todayLabel() {
  try {
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('ar', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }
}

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
  const [loginOpen, setLoginOpen] = useState(false);
  const { auth, logout } = useAuth();
  const settingsQuery = useGetSettings();
  const completedWeeks = settingsQuery.data?.completedWeeks ?? 0;
  const totalWeeks = settingsQuery.data?.totalWeeks ?? 0;
  const weekPercent = totalWeeks > 0 ? Math.round((completedWeeks / totalWeeks) * 100) : 0;
  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <aside className={`fixed inset-y-0 right-0 z-40 flex w-[258px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground transition-transform duration-300 max-md:w-[286px] ${mobileOpen ? 'translate-x-0' : 'max-md:translate-x-full'}`}>
        <Brand />
        <div className="mt-9 border-y border-sidebar-border py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary/15 text-sidebar-primary"><Crown size={18} /></div>
            <div>
              <div className="text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/50">الموسم الحالي</div>
              <div className="mt-1 text-sm font-bold">{todayLabel()}</div>
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between text-[11px] text-sidebar-foreground/55">
            <span>الأسبوع {completedWeeks} من {totalWeeks}</span><span className="text-sidebar-primary">{weekPercent}٪</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sidebar-accent"><div className="h-full rounded-full bg-sidebar-primary transition-all" style={{ width: `${weekPercent}%` }} /></div>
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
          {auth ? (
            <>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">{auth.name.trim().charAt(0) || 'م'}</div>
              <div className="min-w-0"><div className="truncate text-xs font-bold">{auth.name}</div><div className="mt-0.5 text-[10px] text-sidebar-foreground/45">{auth.role === 'admin' ? 'المشرف العام' : 'مدرّب فريق'}</div></div>
              <button data-testid="button-profile-logout" onClick={logout} title="تسجيل الخروج" className="mr-auto rounded-lg p-1.5 text-sidebar-foreground/40 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"><LogOut size={15} /></button>
            </>
          ) : (
            <>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sm font-bold text-sidebar-foreground/60">؟</div>
              <div className="min-w-0"><div className="truncate text-xs font-bold text-sidebar-foreground/70">زائر</div><div className="mt-0.5 text-[10px] text-sidebar-foreground/45">غير مسجّل الدخول</div></div>
              <button data-testid="button-profile-login" onClick={() => setLoginOpen(true)} title="تسجيل الدخول" className="mr-auto rounded-lg p-1.5 text-sidebar-foreground/40 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"><LogIn size={15} /></button>
            </>
          )}
        </div>
      </aside>
      {mobileOpen && <button data-testid="button-close-mobile-nav" aria-label="إغلاق القائمة" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-primary/35 backdrop-blur-sm md:hidden" />}
      <main className="min-h-[100dvh] md:mr-[258px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-xl md:px-10">
          <div className="flex items-center gap-3">
            <button data-testid="button-open-mobile-nav" onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-muted-foreground hover:bg-muted md:hidden"><Menu size={20} /></button>
            <div className="md:hidden"><Brand /></div>
            <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex"><span>اليوم</span><ChevronLeft size={14} /><span className="font-bold text-foreground">{todayLabel()}</span></div>
          </div>
          <div className="flex items-center gap-2">
            {auth ? (
              <div className="flex items-center gap-2">
                <div data-testid="text-trainer-name" className="hidden items-center gap-2 rounded-xl border border-secondary-foreground/20 bg-secondary px-3 py-2 text-xs font-bold text-secondary-foreground sm:flex"><ShieldCheck size={14} /> {auth.name}</div>
                <button data-testid="button-logout" onClick={logout} title="تسجيل الخروج" className="flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground transition hover:border-destructive hover:text-destructive"><LogOut size={15} /> خروج</button>
              </div>
            ) : (
              <button data-testid="button-open-login" onClick={() => setLoginOpen(true)} className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg"><LogIn size={15} /> دخول المدرّب</button>
            )}
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-10 md:py-9">{children}</div>
      </main>
      {loginOpen && <LoginDialog onClose={() => setLoginOpen(false)} />}
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

const TEAM_LOGOS = ['team-1', 'team-2', 'team-3', 'team-4'];

function teamLogo(team?: Team) {
  if (!team) return undefined;
  const index = (((team.id - 1) % TEAM_LOGOS.length) + TEAM_LOGOS.length) % TEAM_LOGOS.length;
  return `${import.meta.env.BASE_URL}logos/${TEAM_LOGOS[index]}.webp`;
}

function TeamMark({ team, size = 'md' }: { team?: Team; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'h-20 w-20 text-xl' : size === 'sm' ? 'h-9 w-9 text-[10px]' : 'h-14 w-14 text-sm';
  const logo = teamLogo(team);
  if (logo) return <img src={logo} alt={team?.name || ''} loading="lazy" className={`${dimensions} shrink-0 object-contain drop-shadow-sm`} />;
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

function useInvalidateCompetition() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: getGetCompetitionDashboardQueryKey() });
    qc.invalidateQueries({ queryKey: getListPlayersQueryKey() });
    qc.invalidateQueries({ queryKey: getListTeamsQueryKey() });
    qc.invalidateQueries({ queryKey: getListMatchesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetLeaderboardQueryKey() });
  };
}

function DialogFrame({
  eyebrow,
  title,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div dir="rtl" className="fixed inset-0 z-50 flex items-end justify-center bg-primary/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-lg animate-rise overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold text-accent"><Pencil size={14} /> {eyebrow}</div>
            <h2 className="text-xl font-bold text-primary">{title}</h2>
          </div>
          <button data-testid="button-close-edit-dialog" onClick={onClose} className="rounded-xl p-2 text-muted-foreground hover:bg-muted"><X size={19} /></button>
        </div>
        <div className="space-y-5 p-6">{children}</div>
      </div>
    </div>
  );
}

function TeamEditDialog({ team, onClose }: { team: Team; onClose: () => void }) {
  const { auth } = useAuth();
  const isAdmin = auth?.role === 'admin';
  const playersQuery = useListPlayers();
  const roster = useMemo(() => (playersQuery.data || []).filter((p) => p.teamId === team.id), [playersQuery.data, team.id]);
  const currentCaptainId = roster.find((p) => p.role === 'كابتن')?.id ?? 0;
  const [name, setName] = useState(team.name);
  const [shortName, setShortName] = useState(team.shortName);
  const [captainId, setCaptainId] = useState(0);
  useEffect(() => { setCaptainId(currentCaptainId); }, [currentCaptainId]);
  const mutation = useUpdateTeam();
  const invalidate = useInvalidateCompetition();
  const nameDirty = isAdmin && (name.trim() !== team.name || shortName.trim() !== team.shortName);
  const captainDirty = captainId !== 0 && captainId !== currentCaptainId;
  const dirty = nameDirty || captainDirty;
  const submit = () => {
    if (!name.trim() || !shortName.trim() || !dirty) return;
    const data: { name?: string; shortName?: string; captainId?: number } = {};
    if (isAdmin) { data.name = name.trim(); data.shortName = shortName.trim(); }
    if (captainDirty) data.captainId = captainId;
    mutation.mutate(
      { id: team.id, data },
      { onSuccess: () => { invalidate(); onClose(); } },
    );
  };
  return (
    <DialogFrame eyebrow="تعديل الفريق" title="تعديل بيانات الفريق" onClose={onClose}>
      {isAdmin && (
        <>
          <div>
            <label className="mb-2 block text-xs font-bold text-muted-foreground">اسم الفريق</label>
            <input data-testid="input-team-name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold text-muted-foreground">الاسم المختصر</label>
            <input data-testid="input-team-shortname" value={shortName} onChange={(e) => setShortName(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" />
          </div>
        </>
      )}
      <div>
        <label className="mb-2 block text-xs font-bold text-muted-foreground"><Crown size={12} className="ml-1 inline" /> قائد الفريق</label>
        <select data-testid="select-team-captain" value={captainId} onChange={(e) => setCaptainId(Number(e.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent">
          <option value={0} disabled>اختر القائد…</option>
          {roster.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {mutation.isError && <p className="text-xs font-bold text-destructive">تعذّر حفظ التعديل. حاول من جديد.</p>}
      <button data-testid="button-submit-team-edit" disabled={mutation.isPending || !dirty} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
        {mutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Check size={17} />} {mutation.isPending ? 'جارٍ الحفظ...' : 'حفظ التعديل'}
      </button>
    </DialogFrame>
  );
}

function PlayerEditDialog({ player, teams, onClose }: { player: Player; teams: Team[]; onClose: () => void }) {
  const { auth } = useAuth();
  const canTransfer = auth?.role === 'admin';
  const [name, setName] = useState(player.name);
  const [teamId, setTeamId] = useState(player.teamId);
  const [manOfMatch, setManOfMatch] = useState(player.stats.manOfMatch);
  const mutation = useUpdatePlayer();
  const invalidate = useInvalidateCompetition();
  const dirty = name.trim() !== player.name || teamId !== player.teamId || manOfMatch !== player.stats.manOfMatch;
  const submit = () => {
    if (!name.trim() || !dirty) return;
    mutation.mutate(
      { id: player.id, data: { name: name.trim(), teamId, manOfMatch } },
      { onSuccess: () => { invalidate(); onClose(); } },
    );
  };
  return (
    <DialogFrame eyebrow="تعديل اللاعب" title="تعديل اللاعب ونقله" onClose={onClose}>
      <div>
        <label className="mb-2 block text-xs font-bold text-muted-foreground">اسم اللاعب</label>
        <input data-testid="input-player-name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" />
      </div>
      {canTransfer && <div>
        <label className="mb-2 block text-xs font-bold text-muted-foreground"><ArrowRightLeft size={12} className="ml-1 inline" /> الفريق</label>
        <select data-testid="select-player-team" value={teamId} onChange={(e) => setTeamId(Number(e.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent">
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        {teamId !== player.teamId && <p className="mt-2 text-[11px] font-bold text-accent-foreground">سيُنقل من {player.teamName} إلى {teams.find((t) => t.id === teamId)?.name}.</p>}
      </div>}
      <button type="button" data-testid="toggle-man-of-match" onClick={() => setManOfMatch((v) => !v)} className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm font-bold transition ${manOfMatch ? 'border-accent bg-accent/15 text-accent-foreground' : 'border-input bg-background text-muted-foreground'}`}>
        <span className="flex items-center gap-2"><Medal size={15} /> رجل الجولة</span>
        <span className={`relative h-5 w-9 rounded-full transition ${manOfMatch ? 'bg-accent' : 'bg-muted'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${manOfMatch ? 'left-0.5' : 'left-[18px]'}`} /></span>
      </button>
      {mutation.isError && <p className="text-xs font-bold text-destructive">تعذّر حفظ التعديل. حاول من جديد.</p>}
      <button data-testid="button-submit-player-edit" disabled={mutation.isPending || !name.trim() || !dirty} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
        {mutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Check size={17} />} {mutation.isPending ? 'جارٍ الحفظ...' : 'حفظ التعديل'}
      </button>
    </DialogFrame>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settingsQuery = useGetSettings();
  const [seasonLabel, setSeasonLabel] = useState('');
  const [completedWeeks, setCompletedWeeks] = useState(0);
  const [totalWeeks, setTotalWeeks] = useState(0);
  const [publicUrl, setPublicUrl] = useState('');
  const urlInvalid = publicUrl.trim() !== '' && !/^https?:\/\/\S+$/i.test(publicUrl.trim());
  useEffect(() => {
    const s = settingsQuery.data;
    if (s) { setSeasonLabel(s.seasonLabel); setCompletedWeeks(s.completedWeeks); setTotalWeeks(s.totalWeeks); setPublicUrl(s.publicUrl); }
  }, [settingsQuery.data]);
  const mutation = useUpdateSettings();
  const invalidate = useInvalidateCompetition();
  const submit = () => {
    if (!seasonLabel.trim() || urlInvalid) return;
    mutation.mutate(
      { data: { seasonLabel: seasonLabel.trim(), completedWeeks, totalWeeks, publicUrl: publicUrl.trim().replace(/\/+$/, '') } },
      { onSuccess: () => { invalidate(); onClose(); } },
    );
  };
  return (
    <DialogFrame eyebrow="إعدادات المسابقة" title="تعديل المسابقة" onClose={onClose}>
      <div>
        <label className="mb-2 block text-xs font-bold text-muted-foreground">اسم المسابقة</label>
        <input data-testid="input-settings-season" value={seasonLabel} onChange={(e) => setSeasonLabel(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-2 block text-xs font-bold text-muted-foreground">الأسابيع المكتملة</label><input data-testid="input-settings-completed" type="number" min={0} value={completedWeeks} onChange={(e) => setCompletedWeeks(Number(e.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-xs font-bold text-muted-foreground">إجمالي الأسابيع</label><input data-testid="input-settings-total" type="number" min={1} value={totalWeeks} onChange={(e) => setTotalWeeks(Number(e.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" /></div>
      </div>
      <div>
        <label className="mb-2 block text-xs font-bold text-muted-foreground">رابط الموقع (لرموز QR)</label>
        <input data-testid="input-settings-public-url" dir="ltr" value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://example.com" className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" />
        <p className="mt-1.5 text-[11px] text-muted-foreground">اتركه فارغاً لاستخدام عنوان الموقع الحالي.</p>
        {urlInvalid && <p className="mt-1 text-xs font-bold text-destructive">يجب أن يبدأ الرابط بـ https://</p>}
      </div>
      {mutation.isError && <p className="text-xs font-bold text-destructive">تعذّر حفظ الإعدادات.</p>}
      <button data-testid="button-submit-settings" disabled={mutation.isPending || !seasonLabel.trim() || urlInvalid} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
        {mutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Check size={17} />} {mutation.isPending ? 'جارٍ الحفظ...' : 'حفظ'}
      </button>
    </DialogFrame>
  );
}

const MATCH_STATUSES = ['مجدولة', 'جارية', 'مكتملة'];

function MatchDialog({ match, teams, onClose }: { match?: Match; teams: Team[]; onClose: () => void }) {
  const editing = !!match;
  const [week, setWeek] = useState(match?.week ?? 1);
  const [status, setStatus] = useState(match?.status ?? 'مجدولة');
  const [dateLabel, setDateLabel] = useState(match?.dateLabel ?? '');
  const [homeTeamId, setHomeTeamId] = useState(match?.homeTeamId ?? teams[0]?.id ?? 0);
  const [awayTeamId, setAwayTeamId] = useState(match?.awayTeamId ?? teams[1]?.id ?? 0);
  const [homeScore, setHomeScore] = useState(match?.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(match?.awayScore ?? 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const createM = useCreateMatch();
  const updateM = useUpdateMatch();
  const deleteM = useDeleteMatch();
  const invalidate = useInvalidateCompetition();
  const pending = createM.isPending || updateM.isPending || deleteM.isPending;
  const isError = createM.isError || updateM.isError || deleteM.isError;
  const submit = () => {
    if (!dateLabel.trim() || homeTeamId === awayTeamId) return;
    const data = { week, status, dateLabel: dateLabel.trim(), homeTeamId, awayTeamId, homeScore, awayScore, attacks: (match?.attacks ?? []) as Attack[] };
    const opts = { onSuccess: () => { invalidate(); onClose(); } };
    if (editing) updateM.mutate({ id: match!.id, data }, opts);
    else createM.mutate({ data }, opts);
  };
  const remove = () => {
    if (!editing) return;
    deleteM.mutate({ id: match!.id }, { onSuccess: () => { invalidate(); onClose(); } });
  };
  return (
    <DialogFrame eyebrow="المباريات" title={editing ? 'تعديل المباراة' : 'إضافة مباراة'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-2 block text-xs font-bold text-muted-foreground">الأسبوع</label><input data-testid="input-match-week" type="number" min={1} value={week} onChange={(e) => setWeek(Number(e.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-xs font-bold text-muted-foreground">الحالة</label><select data-testid="select-match-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent">{MATCH_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      </div>
      <div>
        <label className="mb-2 block text-xs font-bold text-muted-foreground">التاريخ</label>
        <input data-testid="input-match-date" value={dateLabel} onChange={(e) => setDateLabel(e.target.value)} placeholder="مثال: الأربعاء، 1 أكتوبر" className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-2 block text-xs font-bold text-muted-foreground">الفريق الأول</label><select data-testid="select-match-home" value={homeTeamId} onChange={(e) => setHomeTeamId(Number(e.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent">{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="mb-2 block text-xs font-bold text-muted-foreground">الفريق الثاني</label><select data-testid="select-match-away" value={awayTeamId} onChange={(e) => setAwayTeamId(Number(e.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent">{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-2 block text-xs font-bold text-muted-foreground">نتيجة الأول</label><input data-testid="input-match-home-score" type="number" min={0} value={homeScore} onChange={(e) => setHomeScore(Number(e.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-xs font-bold text-muted-foreground">نتيجة الثاني</label><input data-testid="input-match-away-score" type="number" min={0} value={awayScore} onChange={(e) => setAwayScore(Number(e.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" /></div>
      </div>
      {homeTeamId === awayTeamId && <p className="text-xs font-bold text-destructive">اختر فريقين مختلفين.</p>}
      {isError && <p className="text-xs font-bold text-destructive">تعذّر حفظ المباراة.</p>}
      <button data-testid="button-submit-match" disabled={pending || !dateLabel.trim() || homeTeamId === awayTeamId} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? <RefreshCw className="animate-spin" size={16} /> : <Check size={17} />} {pending ? 'جارٍ الحفظ...' : editing ? 'حفظ التعديل' : 'إضافة'}
      </button>
      {editing && (
        confirmDelete ? (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
            <span className="flex-1 text-xs font-bold text-destructive">حذف هذه المباراة نهائياً؟</span>
            <button data-testid="button-confirm-delete-match" onClick={remove} disabled={pending} className="rounded-lg bg-destructive px-3 py-2 text-xs font-bold text-destructive-foreground transition hover:opacity-90 disabled:opacity-50">نعم، احذف</button>
            <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground">إلغاء</button>
          </div>
        ) : (
          <button data-testid="button-delete-match" onClick={() => setConfirmDelete(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 py-3 text-sm font-bold text-destructive transition hover:bg-destructive/10"><Trash2 size={16} /> حذف المباراة</button>
        )
      )}
    </DialogFrame>
  );
}

function Standings({ teams = [] }: { teams?: Team[] }) {
  const ordered = [...teams].sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor);
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
  const { auth } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, setLocation] = useLocation();
  const dashboard = dashboardQuery.data;
  const teams = dashboard?.teams || leaderboardQuery.data?.teams || [];
  return (
    <DataState loading={dashboardQuery.isLoading} error={dashboardQuery.isError} empty={!dashboard && !dashboardQuery.isLoading} onRetry={() => dashboardQuery.refetch()}>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {dashboard && <div className="space-y-7">
        <div className="relative overflow-hidden rounded-[2rem] bg-primary px-6 py-7 text-primary-foreground shadow-xl shadow-primary/10 md:px-9 md:py-8">
          <div className="pitch-grid absolute inset-0 opacity-70" /><div className="absolute -left-16 -top-24 h-64 w-64 rounded-full border border-accent/15" /><div className="absolute -left-5 -top-14 h-44 w-44 rounded-full border border-accent/10" />
          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="animate-rise"><div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-[.16em] text-accent"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> الموسم على الهواء</div><h1 className="max-w-xl text-3xl font-bold leading-[1.35] md:text-5xl">المنافسة تُحسم<br /><span className="text-accent">بخطوة ثابتة.</span></h1><p className="mt-4 max-w-md text-sm leading-7 text-primary-foreground/65">{dashboard.seasonLabel} · الأسبوع {dashboard.completedWeeks} من {dashboard.totalWeeks}. كل تلاوة، كل إجابة، وكل حضور يصنع الفارق.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/matches" data-testid="link-hero-matches" className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-primary transition hover:-translate-y-0.5"><Trophy size={16} /> تابع الجولة</Link>{auth && <button data-testid="button-hero-event" onClick={() => openEvent()} className="inline-flex items-center gap-2 rounded-xl border border-primary-foreground/20 px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary-foreground/10"><Plus size={16} /> سجّل نقطة</button>}{auth?.role === 'admin' && <button data-testid="button-edit-settings" onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-primary-foreground/20 px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary-foreground/10"><Pencil size={16} /> تعديل المسابقة</button>}</div></div>
            <div className="relative flex items-center gap-5 lg:pl-3"><div className="text-center"><div className="number-font text-6xl font-bold text-accent">{dashboard.completedWeeks}</div><div className="mt-1 text-xs text-primary-foreground/55">أسابيع مكتملة</div></div><div className="h-16 w-px bg-primary-foreground/15" /><div className="text-center"><div className="number-font text-6xl font-bold">{dashboard.activePlayers}</div><div className="mt-1 text-xs text-primary-foreground/55">لاعب نشط</div></div></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MiniStat icon={Users} label="إجمالي الطلاب" value={dashboard.totalStudents} tone="mint" /><MiniStat icon={Zap} label="اللاعبون النشطون" value={dashboard.activePlayers} tone="accent" /><MiniStat icon={Trophy} label="الفرق" value={teams.length || 4} tone="primary" /><MiniStat icon={Gauge} label="عدد الجولات" value={dashboard.totalWeeks} tone="mint" />
        </div>
        <div className="grid gap-7 xl:grid-cols-[1.15fr_.85fr]">
          <section><SectionHeading title="ترتيب الميدان" link="كل الفرق" onClick={() => setLocation('/teams')} /><Standings teams={teams} /></section>
          <section><SectionHeading title="الجلسة القادمة" link="عرض المباريات" onClick={() => setLocation('/matches')} /><div className="relative overflow-hidden rounded-3xl bg-secondary p-6"><div className="absolute -left-10 -top-10 h-36 w-36 rounded-full border border-secondary-foreground/10" /><div className="relative"><div className="flex items-center justify-between"><span className="rounded-full bg-card/70 px-3 py-1 text-[11px] font-bold text-secondary-foreground">{dashboard.nextSessionLabel}</span><CalendarDays size={19} className="text-secondary-foreground" /></div><h3 className="mt-7 text-2xl font-bold text-secondary-foreground">{dashboard.nextSessionLabel}</h3><p className="mt-2 text-sm text-secondary-foreground/65">{dashboard.nextSessionDate}</p><div className="mt-6 flex items-center gap-3 border-t border-secondary-foreground/10 pt-4 text-xs text-secondary-foreground/70"><Clock3 size={15} /> جهّز فريقك للجولة القادمة</div></div></div></section>
        </div>
        <div className="grid gap-7 xl:grid-cols-[.8fr_1.2fr]">
          <section><SectionHeading title="لاعب الأسبوع" link="ملف اللاعبين" onClick={() => setLocation('/players')} /><div className="relative overflow-hidden rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border"><div className="absolute left-0 top-0 h-full w-1.5 bg-accent" /><div className="flex items-center gap-4"><div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-accent">{dashboard.featuredPlayer.avatarInitials}<div className="absolute -bottom-2 -left-2 flex h-6 w-6 items-center justify-center rounded-lg bg-accent text-primary"><Star size={13} fill="currentColor" /></div></div><div><div className="flex items-center gap-2 text-lg font-bold">{dashboard.featuredPlayer.name}{dashboard.featuredPlayer.stats.manOfMatch && <span className="inline-flex items-center gap-1 rounded-lg bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-accent-foreground"><Medal size={11} /> رجل الجولة</span>}</div><div className="mt-1 text-xs text-muted-foreground">{dashboard.featuredPlayer.teamName} · {dashboard.featuredPlayer.role}</div></div><div className="mr-auto text-left"><div className="number-font text-2xl font-bold text-primary">{dashboard.featuredPlayer.cardRating}</div><div className="text-[10px] text-muted-foreground">التقييم</div></div></div><div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4"><div><div className="number-font font-bold">{dashboard.featuredPlayer.stats.total}</div><div className="mt-1 text-[10px] text-muted-foreground">إجمالي النقاط</div></div><div><div className="number-font font-bold">{dashboard.featuredPlayer.stats.challengePoints}</div><div className="mt-1 text-[10px] text-muted-foreground">تحدّيات</div></div>{auth ? <button data-testid="button-featured-event" onClick={() => openEvent(dashboard.featuredPlayer)} className="flex items-center justify-center gap-1 rounded-lg bg-muted text-xs font-bold transition hover:bg-accent"><Plus size={13} /> حدث</button> : <div />}</div></div></section>
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
  const [editTeam, setEditTeam] = useState<Team>();
  const { auth } = useAuth();
  return <DataState loading={query.isLoading} error={query.isError} empty={!teams.length} onRetry={() => query.refetch()}><div className="space-y-7"><PageIntro eyebrow="الأندية الأربعة" title="الفرق" description="أربع رايات، ٢٤ لاعباً، وموسم واحد يُكتب أسبوعاً بعد أسبوع." /><div className="grid gap-5 md:grid-cols-2">{teams.map((team, index) => { const roster = (playersQuery.data || []).filter((player) => player.teamId === team.id); return <div data-testid={`card-team-${team.id}`} key={team.id} className="group relative overflow-hidden rounded-3xl border border-border bg-card p-6 transition duration-300 hover:-translate-y-1 hover:shadow-xl"><div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: teamColor(team) }} /><div className="flex items-start justify-between"><div className="flex items-center gap-4"><TeamMark team={team} size="lg" /><div><div className="text-xl font-bold">{team.name}</div><div className="mt-1 text-xs text-muted-foreground">بقيادة {team.coach}</div></div></div><div className="flex items-center gap-2">{(auth?.role === 'admin' || (auth?.role === 'coach' && auth.teamId === team.id)) && <button data-testid={`button-edit-team-${team.id}`} onClick={() => setEditTeam(team)} title="تعديل الفريق" className="rounded-xl border border-border bg-card p-2.5 text-muted-foreground transition hover:border-accent hover:text-accent-foreground"><Pencil size={15} /></button>}<div className="rounded-xl bg-muted px-3 py-2 text-center"><div className="number-font text-xl font-bold">{String(index + 1).padStart(2, '0')}</div><div className="text-[9px] text-muted-foreground">الترتيب</div></div></div></div><div className="mt-6 grid grid-cols-4 divide-x divide-border border-y border-border py-4 text-center"><div><div className="number-font text-lg font-bold text-primary">{team.points}</div><div className="text-[10px] text-muted-foreground">نقطة</div></div><div><div className="number-font text-lg font-bold">{team.wins}</div><div className="text-[10px] text-muted-foreground">فوز</div></div><div><div className="number-font text-lg font-bold">{team.goalsFor}</div><div className="text-[10px] text-muted-foreground">له</div></div><div><div className="number-font text-lg font-bold">{team.playerCount}</div><div className="text-[10px] text-muted-foreground">لاعبون</div></div></div><div className="mt-4 rounded-2xl bg-muted/45 p-3"><div className="mb-2 text-[10px] font-bold text-muted-foreground">قائمة الفريق</div><div className="flex items-center gap-1.5">{roster.slice(0, 6).map((player) => <div data-testid={`roster-player-${player.id}`} key={player.id} title={player.name} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[9px] font-bold text-accent">{player.avatarInitials}</div>)}<span className="mr-1 text-[10px] text-muted-foreground">{roster.length || team.playerCount} لاعبين</span></div></div><div className="mt-4 flex items-center justify-between text-xs"><span className="text-muted-foreground">القائد <b className="mr-1 text-foreground">{team.captainName}</b></span><span className="flex items-center gap-1 font-bold" style={{ color: teamColor(team) }}><Shield size={13} /> {team.assistantCoach}</span></div></div>; })}</div></div>{editTeam && <TeamEditDialog team={editTeam} onClose={() => setEditTeam(undefined)} />}</DataState>;
}

function PlayerCard({ player, teams, onEvent, onEdit, onQr, authed, hideActions = false }: { player: Player; teams?: Team[]; onEvent: (player: Player) => void; onEdit: (player: Player) => void; onQr: (player: Player) => void; authed: boolean; hideActions?: boolean }) {
  const team = teamById(teams, player.teamId);
  const attributes = [
    ['السرعة', player.attributes.pace],
    ['الدفاع', player.attributes.defense],
    ['التسديد', player.attributes.shooting],
    ['المراوغة', player.attributes.dribbling],
    ['التمرير', player.attributes.passing],
    ['البدنية', player.attributes.physical],
  ];
  const position = player.role === 'كابتن' ? 'CAP' : 'STU';

  return (
    <div data-testid={`card-player-${player.id}`} className="space-y-3">
      <div className="fifa-card group">
        <div className="fifa-card__shine" />
        <div className="fifa-card__inner">
          <div className="flex items-start justify-between">
            <div className="text-center leading-none">
              <div className="number-font text-[3.2rem] font-bold tracking-[-.09em]">{player.cardRating}</div>
              <div className="mt-1 text-[10px] font-bold uppercase tracking-[.16em]">{position}</div>
              <div className="mt-3 h-px w-9 bg-slate-900/25" />
              <div className="mt-2 text-[10px] font-bold">{player.teamName.replace('فريق ', '')}</div>
            </div>
            <div className="fifa-card__crest" style={{ backgroundColor: teamLogo(team) ? 'rgba(255,255,255,.92)' : teamColor(team) }}>
              {teamLogo(team) ? <img src={teamLogo(team)} alt={team?.name || ''} className="h-full w-full object-contain p-1" /> : <><Shield size={21} strokeWidth={2.5} /><span>{team?.shortName || 'البدر'}</span></>}
            </div>
          </div>

          <div className="fifa-card__portrait">
            <div className="fifa-card__portrait-ring">
              <div className="fifa-card__initials">{player.avatarInitials}</div>
            </div>
            {player.stats.manOfMatch && <div className="fifa-card__medal"><Medal size={13} /> رجل الجولة</div>}
          </div>

          <div className="mt-auto">
            <div className="mb-3 text-center text-base font-bold">{player.name}</div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 border-t border-slate-900/20 pt-3">
              {attributes.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-2 text-[11px] font-bold">
                  <span className="number-font text-base">{value}</span>
                  <span className="opacity-70">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {!hideActions && <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2.5">
        <div className="text-[10px] text-muted-foreground">
          <span>الرصيد </span>
          <b className="number-font text-sm text-foreground">{player.stats.total}</b>
          <span className="mx-1">·</span>
          <span>متوسط البنود</span>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid={`button-qr-player-${player.id}`} onClick={() => onQr(player)} title="بطاقة QR" className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:border-accent hover:text-accent-foreground"><QrCode size={13} /> QR</button>
          {authed && <button data-testid={`button-edit-player-${player.id}`} onClick={() => onEdit(player)} title="تعديل / نقل" className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:border-accent hover:text-accent-foreground"><Pencil size={13} /> تعديل</button>}
          {authed && <button data-testid={`button-record-player-event-${player.id}`} onClick={() => onEvent(player)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground transition hover:bg-accent hover:text-primary"><Plus size={13} /> تسجيل حدث</button>}
        </div>
      </div>}
    </div>
  );
}

function PlayersPage({ openEvent }: { openEvent: (player?: Player) => void }) {
  const playersQuery = useListPlayers();
  const teamsQuery = useListTeams();
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [editPlayer, setEditPlayer] = useState<Player>();
  const [qrPlayer, setQrPlayer] = useState<Player>();
  const { auth } = useAuth();
  const allPlayers = playersQuery.data || [];
  const isCoach = auth?.role === 'coach' && auth.teamId != null;
  // Coaches only ever see their own team's players.
  const players = useMemo(() => (isCoach ? allPlayers.filter((p) => p.teamId === auth!.teamId) : allPlayers), [allPlayers, isCoach, auth]);
  const filtered = useMemo(() => players.filter((player) => (teamFilter === 'all' || String(player.teamId) === teamFilter) && player.name.includes(search)), [players, search, teamFilter]);
  return <DataState loading={playersQuery.isLoading} error={playersQuery.isError} empty={!players.length} onRetry={() => playersQuery.refetch()}><div className="space-y-7"><PageIntro eyebrow="بطاقات اللاعبين" title="اللاعبون" description="كل لاعب يحمل بطاقة أداء تتطور مع كل جولة وكل نقطة." action={auth ? <button data-testid="button-open-event-players" onClick={() => openEvent()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5"><Plus size={16} /> تسجيل حدث</button> : undefined} /><div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row"><div className="relative flex-1"><Search size={16} className="absolute right-3 top-3 text-muted-foreground" /><input data-testid="input-search-players" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن لاعب..." className="w-full rounded-xl bg-muted/50 py-2.5 pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-accent/40" /></div>{!isCoach && <select data-testid="select-filter-team" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none"><option value="all">كل الفرق</option>{(teamsQuery.data || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>}</div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map((player) => <PlayerCard key={player.id} player={player} teams={teamsQuery.data} onEvent={openEvent} onEdit={setEditPlayer} onQr={setQrPlayer} authed={!!auth} />)}</div>{!filtered.length && <div className="rounded-3xl bg-card p-10 text-center text-sm text-muted-foreground">لا يوجد لاعب يطابق البحث.</div>}</div>{editPlayer && <PlayerEditDialog player={editPlayer} teams={teamsQuery.data || []} onClose={() => setEditPlayer(undefined)} />}{qrPlayer && <QrDialog player={qrPlayer} onClose={() => setQrPlayer(undefined)} />}</DataState>;
}

function AttackSteps({ attacks, homeId, awayId, homeShort, awayShort }: { attacks: Attack[]; homeId: number; awayId: number; homeShort: string; awayShort: string }) {
  return <div className="grid gap-2 sm:grid-cols-4">{attacks.map((attack, index) => <div data-testid={`attack-${attack.id}`} key={attack.id} className={`relative rounded-2xl border p-3 ${attack.status === 'completed' ? 'border-accent/30 bg-accent/10' : attack.status === 'live' ? 'border-secondary-foreground/30 bg-secondary' : 'border-border bg-muted/30'}`}><div className="flex items-center justify-between"><span className="number-font text-xs font-bold text-muted-foreground">٠{index + 1}</span>{attack.status === 'completed' ? <Check size={14} className="text-secondary-foreground" /> : attack.status === 'live' ? <span className="h-2 w-2 animate-pulse rounded-full bg-secondary-foreground" /> : <Clock3 size={13} className="text-muted-foreground" />}</div><div className="mt-3 text-xs font-bold">{attack.label}</div><div className="mt-1 text-[10px] leading-5 text-muted-foreground">{attack.description}</div>{attack.winnerTeamId && <div className="mt-2 text-[10px] font-bold text-secondary-foreground">{attack.winnerTeamId === homeId ? homeShort : awayShort} يحسم المرحلة</div>}</div>)}</div>;
}

function MatchCard({ match, teams, onEdit }: { match: Match; teams?: Team[]; onEdit?: (match: Match) => void }) {
  const home = teamById(teams, match.homeTeamId);
  const away = teamById(teams, match.awayTeamId);
  const live = match.status === 'live' || match.status === 'جارية';
  return <div data-testid={`card-match-${match.id}`} className="rounded-3xl border border-border bg-card p-5 transition hover:shadow-lg"><div className="flex items-center justify-between text-xs"><span className={`flex items-center gap-2 font-bold ${live ? 'text-destructive' : 'text-muted-foreground'}`}>{live && <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />}{live ? 'مباشر الآن' : (match.status === 'completed' || match.status === 'مكتملة') ? 'انتهت' : 'قادمة'}</span><span className="flex items-center gap-2 text-muted-foreground">الأسبوع {match.week} · {match.dateLabel}{onEdit && <button data-testid={`button-edit-match-${match.id}`} onClick={() => onEdit(match)} title="تعديل المباراة" className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-accent hover:text-accent-foreground"><Pencil size={13} /></button>}</span></div><div className="my-6 flex items-center justify-center gap-7 sm:gap-16"><div className="flex w-20 flex-col items-center gap-2 text-center"><TeamMark team={home} /><span className="text-xs font-bold">{match.homeTeamName}</span></div><div className="text-center"><div className="number-font text-3xl font-bold text-primary">{match.homeScore} <span className="mx-1 text-muted-foreground">—</span> {match.awayScore}</div><div className="mt-1 text-[10px] text-muted-foreground">النتيجة الحالية</div></div><div className="flex w-20 flex-col items-center gap-2 text-center"><TeamMark team={away} /><span className="text-xs font-bold">{match.awayTeamName}</span></div></div><AttackSteps attacks={match.attacks} homeId={match.homeTeamId} awayId={match.awayTeamId} homeShort={match.homeTeamShortName} awayShort={match.awayTeamShortName} /></div>;
}

function MatchesPage() {
  const matchesQuery = useListMatches();
  const teamsQuery = useListTeams();
  const { auth } = useAuth();
  const isAdmin = auth?.role === 'admin';
  const [matchDialog, setMatchDialog] = useState<{ match?: Match } | undefined>();
  const matches = matchesQuery.data || [];
  return <DataState loading={matchesQuery.isLoading} error={matchesQuery.isError} empty={false} onRetry={() => matchesQuery.refetch()}><div className="space-y-7"><PageIntro eyebrow="موسم على شكل مباراة" title="المباريات" description="كل أسبوع يحمل أربع مراحل هجومية. تابع لحظة الحسم، ثم شاهد أثرها على جدول الترتيب." action={isAdmin ? <button data-testid="button-add-match" onClick={() => setMatchDialog({})} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5"><Plus size={16} /> إضافة مباراة</button> : undefined} /><div className="flex items-center justify-between rounded-2xl bg-primary px-5 py-4 text-primary-foreground"><div className="flex items-center gap-3"><div className="rounded-xl bg-accent p-2 text-primary"><Network size={17} /></div><div><div className="text-sm font-bold">نظام الهجمات الأربع</div><div className="mt-1 text-[11px] text-primary-foreground/55">قرآن · حفظ · أونلاين · مهمّة خاصة</div></div></div><Link href="/questions" data-testid="link-matches-questions" className="text-xs font-bold text-accent">بنك الأسئلة <ArrowLeft size={14} className="mr-1 inline" /></Link></div><div className="space-y-4">{!matches.length && <div data-testid="empty-matches" className="flex min-h-48 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card p-8 text-center"><div className="mb-3 rounded-full bg-secondary p-3 text-secondary-foreground"><CalendarDays size={22} /></div><h3 className="font-bold">لا توجد مباريات بعد</h3><p className="mt-1 text-sm text-muted-foreground">{isAdmin ? 'ابدأ الموسم بإضافة أول مباراة.' : 'ستظهر المباريات هنا مع انطلاق الموسم.'}</p></div>}{matches.map((match) => <MatchCard key={match.id} match={match} teams={teamsQuery.data} onEdit={isAdmin ? (m) => setMatchDialog({ match: m }) : undefined} />)}</div></div>{matchDialog && <MatchDialog match={matchDialog.match} teams={teamsQuery.data || []} onClose={() => setMatchDialog(undefined)} />}</DataState>;
}

const QUESTION_CATEGORIES = ['ماذا تعرف؟', 'المزاد', 'الجرس'];

function CreateQuestionDialog({ onClose }: { onClose: () => void }) {
  const [category, setCategory] = useState(QUESTION_CATEGORIES[0]);
  const [prompt, setPrompt] = useState('');
  const [points, setPoints] = useState(5);
  const [difficulty, setDifficulty] = useState('easy');
  const mutation = useCreateQuestion();
  const qc = useQueryClient();
  const submit = () => {
    if (!category.trim() || !prompt.trim()) return;
    mutation.mutate(
      { data: { category: category.trim(), prompt: prompt.trim(), points, difficulty, isPublished: true } },
      { onSuccess: () => { qc.invalidateQueries({ queryKey: getListQuestionsQueryKey() }); onClose(); } },
    );
  };
  return (
    <DialogFrame eyebrow="بنك التحدّي" title="إضافة سؤال" onClose={onClose}>
      <div>
        <label className="mb-2 block text-xs font-bold text-muted-foreground">التصنيف</label>
        <select data-testid="select-question-category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent">
          {QUESTION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <label className="mb-2 block text-xs font-bold text-muted-foreground">نص السؤال</label>
        <textarea data-testid="input-question-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} className="w-full resize-none rounded-xl border border-input bg-background px-3 py-3 text-sm leading-6 outline-none focus:border-accent" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="mb-2 block text-xs font-bold text-muted-foreground">النقاط</label><input data-testid="input-question-points" type="number" min={1} max={100} value={points} onChange={(e) => setPoints(Number(e.target.value))} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent" /></div>
        <div><label className="mb-2 block text-xs font-bold text-muted-foreground">المستوى</label><select data-testid="select-question-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent"><option value="easy">مبتدئ</option><option value="medium">متوسط</option><option value="hard">متقدم</option></select></div>
      </div>
      {mutation.isError && <p className="text-xs font-bold text-destructive">تعذّر حفظ السؤال. حاول من جديد.</p>}
      <button data-testid="button-submit-question" disabled={mutation.isPending || !category.trim() || !prompt.trim()} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
        {mutation.isPending ? <RefreshCw className="animate-spin" size={16} /> : <Check size={17} />} {mutation.isPending ? 'جارٍ الحفظ...' : 'إضافة السؤال'}
      </button>
    </DialogFrame>
  );
}

function QuestionsPage() {
  const query = useListQuestions();
  const [category, setCategory] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const { auth } = useAuth();
  const questions = query.data || [];
  const categories = [...new Set(questions.map((question) => question.category))];
  const visible = questions.filter((question) => category === 'all' || question.category === category);
  return <DataState loading={query.isLoading} error={query.isError} empty={!questions.length} onRetry={() => query.refetch()}><div className="space-y-7"><PageIntro eyebrow="Challenge 30" title="بنك التحدّي" description="أسئلة مختارة بعناية، بدرجات متفاوتة، لتبقى المنافسة عادلة وممتعة." action={<div className="flex items-center gap-2"><div className="flex items-center gap-2 rounded-xl bg-accent/20 px-3 py-2 text-xs font-bold text-accent-foreground"><CircleHelp size={16} /> {questions.length} سؤال</div>{auth && <button data-testid="button-add-question" onClick={() => setAddOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5"><Plus size={16} /> إضافة سؤال</button>}</div>} /><div className="flex flex-wrap gap-2"><button data-testid="button-filter-questions-all" onClick={() => setCategory('all')} className={`rounded-xl px-4 py-2 text-xs font-bold transition ${category === 'all' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground ring-1 ring-border hover:bg-muted'}`}>الكل</button>{categories.map((item) => <button data-testid={`button-filter-question-${item}`} key={item} onClick={() => setCategory(item)} className={`rounded-xl px-4 py-2 text-xs font-bold transition ${category === item ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground ring-1 ring-border hover:bg-muted'}`}>{categoryLabels[item] || item}</button>)}</div><div className="grid gap-4 lg:grid-cols-2">{visible.map((question: Question, index) => <div data-testid={`card-question-${question.id}`} key={question.id} className="group rounded-3xl border border-border bg-card p-5 transition hover:border-accent/50 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-2"><span className="number-font flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-xs font-bold text-accent">{String(index + 1).padStart(2, '0')}</span><span className="rounded-lg bg-secondary px-2.5 py-1 text-[10px] font-bold text-secondary-foreground">{categoryLabels[question.category] || question.category}</span></div><span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${question.difficulty === 'hard' ? 'bg-destructive/10 text-destructive' : question.difficulty === 'medium' ? 'bg-accent/20 text-accent-foreground' : 'bg-secondary text-secondary-foreground'}`}>{question.difficulty === 'hard' ? 'متقدم' : question.difficulty === 'medium' ? 'متوسط' : 'مبتدئ'}</span></div><p className="mt-5 text-sm font-bold leading-7 text-primary">{question.prompt}</p><div className="mt-5 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Target size={14} /> سؤال التحدّي</span><span className="number-font font-bold text-accent-foreground">{question.points} نقاط</span></div></div>)}</div></div>{addOpen && <CreateQuestionDialog onClose={() => setAddOpen(false)} />}</DataState>;
}

function Router() {
  const [location] = useLocation();
  const [eventPlayer, setEventPlayer] = useState<Player>();
  const [eventOpen, setEventOpen] = useState(false);
  const playersQuery = useListPlayers();
  const openEvent = (player?: Player) => { setEventPlayer(player); setEventOpen(true); };
  return <Shell><ErrorBoundary resetKey={location}><Switch><Route path="/"><DashboardPage openEvent={openEvent} /></Route><Route path="/teams"><TeamsPage /></Route><Route path="/players"><PlayersPage openEvent={openEvent} /></Route><Route path="/matches"><MatchesPage /></Route><Route path="/questions"><QuestionsPage /></Route><Route component={NotFound} /></Switch></ErrorBoundary>{eventOpen ? <CoachEventDialog player={eventPlayer} players={playersQuery.data || []} onClose={() => { setEventOpen(false); setEventPlayer(undefined); }} /> : null}</Shell>;
}

function CardPage({ token }: { token: string }) {
  const cardQuery = useGetPlayerCard(token);
  const teamsQuery = useListTeams();
  const player = cardQuery.data;
  const [qrUrl, setQrUrl] = useState('');
  const cardLink = qrLink(token);
  useEffect(() => {
    QRCode.toDataURL(cardLink, { width: 220, margin: 1 }).then(setQrUrl).catch(() => setQrUrl(''));
  }, [cardLink]);
  return (
    <div dir="rtl" className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-accent text-primary"><span className="relative text-lg font-bold">ب</span></div>
        <div className="leading-tight"><div className="text-sm font-bold">شباب البدر</div><div className="mt-0.5 text-[10px] text-muted-foreground">البطاقة الافتراضية</div></div>
      </div>
      <DataState loading={cardQuery.isLoading} error={cardQuery.isError} empty={!player && !cardQuery.isLoading} onRetry={() => cardQuery.refetch()}>
        {player && (
          <div className="w-full max-w-sm space-y-4">
            <PlayerCard player={player} teams={teamsQuery.data} onEvent={() => {}} onEdit={() => {}} onQr={() => {}} authed={false} hideActions />
            <div className="flex flex-col items-center gap-2 rounded-3xl border border-border bg-card p-5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-secondary-foreground"><ShieldCheck size={14} /> بطاقة موثّقة</div>
              {qrUrl && <img src={qrUrl} alt="QR" className="h-40 w-40 rounded-xl" />}
              <p className="text-[11px] text-muted-foreground">{player.name} · {player.teamName}</p>
            </div>
          </div>
        )}
      </DataState>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Switch>
            <Route path="/card/:token">{(params) => <CardPage token={params.token} />}</Route>
            <Route><Router /></Route>
          </Switch>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;