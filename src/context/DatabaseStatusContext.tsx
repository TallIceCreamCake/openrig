import React from 'react';
import { RefreshCw } from 'lucide-react';

const DATABASE_ERROR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" data-name="Layer 1" viewBox="0 0 860.13137 571.14799">
  <path d="M605.66974,324.95306c-7.66934-12.68446-16.7572-26.22768-30.98954-30.36953-16.482-4.7965-33.4132,4.73193-47.77473,14.13453a1392.15692,1392.15692,0,0,0-123.89338,91.28311l.04331.49238q46.22556-3.1878,92.451-6.37554c22.26532-1.53546,45.29557-3.2827,64.97195-13.8156,7.46652-3.99683,14.74475-9.33579,23.20555-9.70782,10.51175-.46217,19.67733,6.87923,26.8802,14.54931,42.60731,45.371,54.937,114.75409,102.73817,154.61591A1516.99453,1516.99453,0,0,0,605.66974,324.95306Z" transform="translate(-169.93432 -164.42601)" fill="#f2f2f2"/>
  <path d="M867.57068,709.78146c-4.71167-5.94958-6.6369-7.343-11.28457-13.34761q-56.7644-73.41638-106.70791-151.79237-33.92354-53.23-64.48275-108.50439-14.54864-26.2781-28.29961-52.96872-10.67044-20.6952-20.8646-41.63793c-1.94358-3.98782-3.8321-7.99393-5.71122-12.00922-4.42788-9.44232-8.77341-18.93047-13.43943-28.24449-5.31686-10.61572-11.789-21.74485-21.55259-28.877a29.40493,29.40493,0,0,0-15.31855-5.89458c-7.948-.51336-15.28184,2.76855-22.17568,6.35295-50.43859,26.301-97.65922,59.27589-140.3696,96.79771A730.77816,730.77816,0,0,0,303.32241,496.24719c-1.008,1.43927-3.39164.06417-2.37419-1.38422q6.00933-8.49818,12.25681-16.81288A734.817,734.817,0,0,1,500.80465,303.06436q18.24824-11.82581,37.18269-22.54245c6.36206-3.60275,12.75188-7.15967,19.25136-10.49653,6.37146-3.27274,13.13683-6.21547,20.41563-6.32547,24.7701-.385,37.59539,27.66695,46.40506,46.54248q4.15283,8.9106,8.40636,17.76626,16.0748,33.62106,33.38729,66.628,10.68453,20.379,21.83683,40.51955,34.7071,62.71816,73.77854,122.897c34.5059,53.1429,68.73651,100.08874,108.04585,149.78472C870.59617,709.21309,868.662,711.17491,867.57068,709.78146Z" transform="translate(-169.93432 -164.42601)" fill="#e4e4e4"/>
  <path d="M414.91613,355.804c-1.43911-1.60428-2.86927-3.20856-4.31777-4.81284-11.42244-12.63259-23.6788-25.11847-39.3644-32.36067a57.11025,57.11025,0,0,0-23.92679-5.54622c-8.56213.02753-16.93178,2.27348-24.84306,5.41792-3.74034,1.49427-7.39831,3.1902-11.00078,4.99614-4.11634,2.07182-8.15927,4.28118-12.1834,6.50883q-11.33112,6.27044-22.36816,13.09089-21.9606,13.57221-42.54566,29.21623-10.67111,8.11311-20.90174,16.75788-9.51557,8.03054-18.64618,16.492c-1.30169,1.20091-3.24527-.74255-1.94358-1.94347,1.60428-1.49428,3.22691-2.97938,4.84955-4.44613q6.87547-6.21546,13.9712-12.19257,12.93921-10.91827,26.54851-20.99312,21.16293-15.67614,43.78288-29.22541,11.30361-6.76545,22.91829-12.96259c2.33794-1.24675,4.70318-2.466,7.09572-3.6211a113.11578,113.11578,0,0,1,16.86777-6.86632,60.0063,60.0063,0,0,1,25.476-2.50265,66.32706,66.32706,0,0,1,23.50512,8.1314c15.40091,8.60812,27.34573,21.919,38.97,34.90915C418.03337,355.17141,416.09875,357.12405,414.91613,355.804Z" transform="translate(-169.93432 -164.42601)" fill="#e4e4e4"/>
  <path d="M730.47659,486.71092l36.90462-13.498,18.32327-6.70183c5.96758-2.18267,11.92082-4.66747,18.08988-6.23036a28.53871,28.53871,0,0,1,16.37356.20862,37.73753,37.73753,0,0,1,12.771,7.91666,103.63965,103.63965,0,0,1,10.47487,11.18643c3.98932,4.79426,7.91971,9.63877,11.86772,14.46706q24.44136,29.89094,48.56307,60.04134,24.12117,30.14991,47.91981,60.556,23.85681,30.48041,47.38548,61.21573,2.88229,3.76518,5.75966,7.53415c1.0598,1.38809,3.44949.01962,2.37472-1.38808Q983.582,650.9742,959.54931,620.184q-24.09177-30.86383-48.51647-61.46586-24.42421-30.60141-49.17853-60.93743-6.16706-7.55761-12.35445-15.09858c-3.47953-4.24073-6.91983-8.52718-10.73628-12.47427-7.00539-7.24516-15.75772-13.64794-26.23437-13.82166-6.15972-.10214-12.121,1.85248-17.844,3.92287-6.16968,2.232-12.32455,4.50571-18.48633,6.75941l-37.16269,13.59243-9.29067,3.3981c-1.64875.603-.93651,3.2619.73111,2.652Z" transform="translate(-169.93432 -164.42601)" fill="#e4e4e4"/>
  <path d="M366.37741,334.52609c-18.75411-9.63866-42.77137-7.75087-60.00508,4.29119a855.84708,855.84708,0,0,1,97.37056,22.72581C390.4603,353.75916,380.07013,341.5635,366.37741,334.52609Z" transform="translate(-169.93432 -164.42601)" fill="#f2f2f2"/>
  <path d="M306.18775,338.7841l-3.61042,2.93462c1.22123-1.02713,2.4908-1.99013,3.795-2.90144C306.31073,338.80665,306.24935,338.79473,306.18775,338.7841Z" transform="translate(-169.93432 -164.42601)" fill="#f2f2f2"/>
  <path d="M831.54929,486.84576c-3.6328-4.42207-7.56046-9.05222-12.99421-10.84836l-5.07308.20008A575.436,575.436,0,0,0,966.74929,651.418Q899.14929,569.13192,831.54929,486.84576Z" transform="translate(-169.93432 -164.42601)" fill="#f2f2f2"/>
  <path d="M516.08388,450.36652A37.4811,37.4811,0,0,0,531.015,471.32518c2.82017,1.92011,6.15681,3.76209,7.12158,7.03463a8.37858,8.37858,0,0,1-.87362,6.1499,24.88351,24.88351,0,0,1-3.86126,5.04137l-.13667.512c-6.99843-4.14731-13.65641-9.3934-17.52227-16.55115s-4.40553-16.53895.34116-23.14544" transform="translate(-169.93432 -164.42601)" fill="#f2f2f2"/>
  <path d="M749.08388,653.36652A37.4811,37.4811,0,0,0,764.015,674.32518c2.82017,1.92011,6.15681,3.76209,7.12158,7.03463a8.37858,8.37858,0,0,1-.87362,6.1499,24.88351,24.88351,0,0,1-3.86126,5.04137l-.13667.512c-6.99843-4.14731-13.65641-9.3934-17.52227-16.55115s-4.40553-16.53895.34116-23.14544" transform="translate(-169.93432 -164.42601)" fill="#f2f2f2"/>
  <path d="M284.08388,639.36652A37.4811,37.4811,0,0,0,299.015,660.32518c2.82017,1.92011,6.15681,3.76209,7.12158,7.03463a8.37858,8.37858,0,0,1-.87362,6.1499,24.88351,24.88351,0,0,1-3.86126,5.04137l-.13667.512c-6.99843-4.14731-13.65641-9.3934-17.52227-16.55115s-4.40553-16.53895.34116-23.14544" transform="translate(-169.93432 -164.42601)" fill="#f2f2f2"/>
  <circle cx="649.24878" cy="51" r="51" fill="#6c63ff"/>
  <!-- Many additional decorative paths omitted for brevity -->
  <path d="M1028.875,735.26666l-857.75.30733a1.19068,1.19068,0,1,1,0-2.38136l857.75-.30734a1.19069,1.19069,0,0,1,0,2.38137Z" transform="translate(-169.93432 -164.42601)" fill="#cacaca"/>
</svg>
`;

type DatabaseHealthStatus = 'ready' | 'invalid' | 'unauthorized' | 'unreachable' | 'failed' | 'unknown';
type BootstrapStatus = 'idle' | 'running' | 'ready' | 'failed';

type DatabaseHealthIssue = {
  table?: string;
  columns?: string[];
  status?: string;
  message?: string | null;
};

type DatabaseHealthResponse = {
  status?: string | null;
  message?: string | null;
  issues?: DatabaseHealthIssue[] | null;
  bootstrapStatus?: string | null;
  bootstrapError?: string | null;
};

const VALID_HEALTH_STATUSES: readonly DatabaseHealthStatus[] = ['ready', 'invalid', 'unauthorized', 'unreachable', 'failed', 'unknown'];
const VALID_BOOTSTRAP_STATUSES: readonly BootstrapStatus[] = ['idle', 'running', 'ready', 'failed'];

const normalizeHealthStatus = (value?: string | null): DatabaseHealthStatus => {
  if (value && VALID_HEALTH_STATUSES.includes(value as DatabaseHealthStatus)) {
    return value as DatabaseHealthStatus;
  }
  return 'unknown';
};

const normalizeBootstrapStatus = (value?: string | null): BootstrapStatus => {
  if (value && VALID_BOOTSTRAP_STATUSES.includes(value as BootstrapStatus)) {
    return value as BootstrapStatus;
  }
  return 'idle';
};

const summarizeIssues = (issues: DatabaseHealthIssue[] = []): string => {
  return issues
    .map((issue) => {
      if (issue?.message) {
        return issue.message;
      }
      if (issue?.table && issue?.status) {
        return `${issue.status}: ${issue.table}`;
      }
      if (issue?.table) {
        return `Table ${issue.table} invalide`;
      }
      return null;
    })
    .filter((entry): entry is string => Boolean(entry && entry.trim().length > 0))
    .join(' | ');
};

const interpretHealthResponse = (data: DatabaseHealthResponse) => {
  const status = normalizeHealthStatus(data?.status);
  const bootstrapStatus = normalizeBootstrapStatus(data?.bootstrapStatus);

  if (status === 'ready') {
    return {
      status,
      bootstrapStatus,
      connected: true,
      message: null as string | null,
    };
  }

  if (bootstrapStatus === 'running') {
    return {
      status,
      bootstrapStatus,
      connected: false,
      message: 'Initialisation de Supabase en cours...',
    };
  }

  const serverMessage = typeof data?.message === 'string' && data.message.trim().length > 0
    ? data.message.trim()
    : null;

  const fallbackMessage = (() => {
    switch (status) {
      case 'invalid':
        return 'Structure Supabase invalide.';
      case 'unauthorized':
        return 'Acces Supabase refuse. Verifiez la cle service_role.';
      case 'unreachable':
        return 'Supabase est inaccessible.';
      case 'failed':
        return 'Verification de Supabase indisponible.';
      default:
        return 'Etat de la base de donnees inconnu.';
    }
  })();

  const issuesSummary = summarizeIssues(Array.isArray(data?.issues) ? data?.issues || [] : []);
  const bootstrapError = typeof data?.bootstrapError === 'string' && data.bootstrapError.trim().length > 0
    ? data.bootstrapError.trim()
    : '';

  const details = [issuesSummary, bootstrapError].filter((entry) => entry.length > 0).join(' | ');

  return {
    status,
    bootstrapStatus,
    connected: false,
    message: [serverMessage || fallbackMessage, details].filter((entry) => entry.length > 0).join(' | '),
  };
};

type DatabaseStatusContextValue = {
  isConnected: boolean;
  status: DatabaseHealthStatus;
  bootstrapStatus: BootstrapStatus;
  lastError: string | null;
  checking: boolean;
  retry: () => void;
};

const DatabaseStatusContext = React.createContext<DatabaseStatusContextValue | undefined>(undefined);

const HEALTH_CHECK_INTERVAL = 30000;

export const DatabaseStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = React.useState<DatabaseHealthStatus>('unknown');
  const [bootstrapStatus, setBootstrapStatus] = React.useState<BootstrapStatus>('idle');
  const [isConnected, setIsConnected] = React.useState(true);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);

  const performCheck = React.useCallback(async () => {
    setChecking(true);
    const controller = new AbortController();
    let timeoutId: number | null = null;

    try {
      if (typeof window !== 'undefined') {
        timeoutId = window.setTimeout(() => controller.abort(), 10000);
      }

      const response = await fetch('/api/system/database-health', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (timeoutId !== null && typeof window !== 'undefined') {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!response.ok) {
        throw new Error(`Verification Supabase renvoie ${response.status}`);
      }

      const payload = (await response.json()) as DatabaseHealthResponse;
      const interpreted = interpretHealthResponse(payload);

      setStatus(interpreted.status);
      setBootstrapStatus(interpreted.bootstrapStatus);
      setIsConnected(interpreted.connected);
      setLastError(interpreted.connected ? null : interpreted.message || null);
    } catch (error) {
      if (timeoutId !== null && typeof window !== 'undefined') {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      const isAbortError = error instanceof DOMException && error.name === 'AbortError';
      if (!isAbortError) {
        console.error('Database health check failed', error);
      }

      setStatus('failed');
      setBootstrapStatus((prev) => (prev === 'running' ? prev : 'failed'));
      setIsConnected(false);

      if (isAbortError) {
        setLastError('Verification Supabase timeout.');
      } else if (error instanceof Error) {
        setLastError(error.message || 'Erreur lors de la verification de Supabase.');
      } else {
        setLastError('Erreur inconnue pendant la verification de Supabase.');
      }
    } finally {
      if (timeoutId !== null && typeof window !== 'undefined') {
        window.clearTimeout(timeoutId);
      }
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    void performCheck();

    const interval = window.setInterval(() => {
      void performCheck();
    }, HEALTH_CHECK_INTERVAL);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void performCheck();
      }
    };

    const handleOnline = () => {
      void performCheck();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [performCheck]);

  const value: DatabaseStatusContextValue = React.useMemo(
    () => ({
      isConnected,
      status,
      bootstrapStatus,
      lastError,
      checking,
      retry: () => {
        void performCheck();
      },
    }),
    [isConnected, status, bootstrapStatus, lastError, checking, performCheck],
  );

  return (
    <DatabaseStatusContext.Provider value={value}>
      {children}
    </DatabaseStatusContext.Provider>
  );
};

export const useDatabaseStatus = () => {
  const ctx = React.useContext(DatabaseStatusContext);
  if (!ctx) {
    throw new Error('useDatabaseStatus must be used within a DatabaseStatusProvider');
  }
  return ctx;
};

export const DatabaseOfflineOverlay: React.FC = () => {
  const { isConnected, lastError, checking, retry } = useDatabaseStatus();

  if (isConnected) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[12070] flex w-screen h-screen bg-gradient-to-br from-white via-slate-50 to-blue-50 text-slate-800">
      <section className="flex w-full h-full">
        <div className="m-auto flex flex-col items-center text-center space-y-6 px-6">
          <div
            className="w-64 h-64 mx-auto sm:h-96 sm:w-96"
            dangerouslySetInnerHTML={{ __html: DATABASE_ERROR_SVG }}
          />
          <h1 className="font-black text-5xl sm:text-6xl text-slate-800">Connexion perdue</h1>
          <p className="max-w-xl text-base-content/80 text-slate-600 px-4">
            Oups&nbsp;! Nous ne parvenons plus à joindre la base de données. Tant que la connexion n’est pas rétablie,
            vous ne pourrez pas utiliser l’application. Vérifiez le service et réessayez dans quelques instants.
          </p>
          {lastError && (
            <p className="text-sm text-slate-500 max-w-md px-4">
              <span className="font-semibold text-slate-700">Détails&nbsp;:</span> {lastError}
            </p>
          )}
          <div className="flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={retry}
              disabled={checking}
              className="btn btn-sm btn-soft btn-secondary px-5 py-2.5 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 shadow-lg"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Nouvelle tentative...' : 'Réessayer maintenant'}
            </button>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Surveillance automatique toutes les 30 secondes
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
