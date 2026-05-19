import { useEffect } from 'react';

const TITLE_MAP: Array<{ match: RegExp; format: (match: RegExpExecArray) => string }> = [
  { match: /^\/$/, format: () => 'Tableau de bord · Open RIG' },
  { match: /^\/equipment$/, format: () => 'Matériel · Open RIG' },
  { match: /^\/equipment\/(.+)$/, format: (m) => `Matériel #${m[1]} · Open RIG` },
  { match: /^\/vehicles$/, format: () => 'Véhicules · Open RIG' },
  { match: /^\/vehicles\/(.+)$/, format: (m) => `Véhicule #${m[1]} · Open RIG` },
  { match: /^\/rentals$/, format: () => 'Projets · Open RIG' },
  { match: /^\/rentals\/(.+)$/, format: (m) => `Projet #${m[1]} · Open RIG` },
  { match: /^\/services$/, format: () => 'Services · Open RIG' },
  { match: /^\/services\/(.+)$/, format: (m) => `Service #${m[1]} · Open RIG` },
  { match: /^\/clients$/, format: () => 'Clients · Open RIG' },
  { match: /^\/clients\/(.+)$/, format: (m) => `Client #${m[1]} · Open RIG` },
  { match: /^\/warehouses$/, format: () => 'Entrepôts · Open RIG' },
  { match: /^\/warehouses\/(.+)$/, format: (m) => `Entrepôt #${m[1]} · Open RIG` },
  { match: /^\/calendar$/, format: () => 'Calendrier · Open RIG' },
  { match: /^\/personnel$/, format: () => 'Gestion Crew · Open RIG' },
  { match: /^\/chat$/, format: () => 'Chat du personnel · Open RIG' },
  { match: /^\/personnel\/(.+)$/, format: (m) => `Collaborateur #${m[1]} · Open RIG` },
  { match: /^\/accounting$/, format: () => 'Comptabilité · Open RIG' },
  { match: /^\/accounting\/documents$/, format: () => 'Factures & devis · Open RIG' },
  { match: /^\/accounting\/documents\/new$/, format: () => 'Nouveau document · Open RIG' },
  { match: /^\/accounting\/documents\/(.+)$/, format: (m) => `Document #${m[1]} · Open RIG` },
  { match: /^\/maintenance$/, format: () => 'Maintenance · Open RIG' },
  { match: /^\/maintenance\/(.+)$/, format: (m) => `Maintenance #${m[1]} · Open RIG` },
  { match: /^\/settings$/, format: () => 'Paramètres · Open RIG' },
  { match: /^\/company$/, format: () => 'Paramètres société · Open RIG' },
  { match: /^\/m$/, format: () => 'Mobile | Menu · Open RIG' },
  { match: /^\/m\/preparations$/, format: () => 'Mobile | Préparations · Open RIG' },
  { match: /^\/m\/prestations$/, format: () => 'Mobile | Projets · Open RIG' },
  { match: /^\/m\/preparations\/(.+)$/, format: (m) => `Mobile | Préparation #${m[1]} · Open RIG` },
  { match: /^\/m\/account$/, format: () => 'Mobile | Compte · Open RIG' },
];

export const useDocumentTitle = (path: string, name?: string) => {
  useEffect(() => {
    if (name) {
      document.title = `${name} · Open RIG`;
      return;
    }
    const entry = TITLE_MAP.find(({ match }) => match.test(path));
    if (entry) {
      const result = entry.match.exec(path);
      document.title = result ? entry.format(result) : 'Open RIG';
    } else {
      document.title = 'Open RIG';
    }
  }, [path, name]);
};
