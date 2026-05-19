import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  BellRing,
  BellOff,
  CheckCircle2,
  GripVertical,
  KeyRound,
  Languages,
  LogIn,
  Mail,
  MapPin,
  Menu as MenuIcon,
  MessageSquare,
  MonitorSmartphone,
  Moon,
  Palette,
  Plus,
  QrCode,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/TranslationContext';
import { supabase } from '../lib/supabase';
import { createNotification } from '../lib/notifications';
import { setCookie } from '../utils/cookies';
import {
  applyTheme,
  applyDensity,
  applyNavigationColors,
  getNavigationColors,
  normalizeNavigationColors,
  getNavThemePreset,
  NAV_THEME_PRESETS,
  NAV_THEME_PRESET_STORAGE_KEY,
  type NavigationColorConfig,
  type NavThemePreset,
} from '../utils/theme';
import { ColorPickerButton } from '../components/ui-kit';
import {
  DEFAULT_MENU_LAYOUT,
  MenuLayoutNode,
  NAV_ITEM_DEFINITIONS,
  NavItemKey,
  cloneMenuLayout,
  normalizeMenuLayout,
  flattenMenuLayout,
} from '../constants/navigation';

type TabId = 'account' | 'appearance' | 'language' | 'notifications' | 'security' | 'navigation';

const tabs: { id: TabId; labelKey: string; icon: React.FC<any> }[] = [
  { id: 'account', labelKey: 'settings.tabs.account', icon: User },
  { id: 'appearance', labelKey: 'settings.tabs.appearance', icon: Palette },
  { id: 'language', labelKey: 'settings.tabs.language', icon: Languages },
  { id: 'notifications', labelKey: 'settings.tabs.notifications', icon: Bell },
  { id: 'security', labelKey: 'settings.tabs.security', icon: Shield },
  { id: 'navigation', labelKey: 'settings.tabs.navigation', icon: MenuIcon },
];

const isTabId = (value: string | null): value is TabId =>
  !!value && tabs.some((tab) => tab.id === value);

const cloneMenuNode = (node: MenuLayoutNode): MenuLayoutNode => {
  if (node.type === 'group') {
    return {
      id: node.id,
      type: 'group',
      label: node.label,
      children: node.children.map(cloneMenuNode),
    };
  }
  return { id: node.id, type: 'item', key: node.key };
};

const sanitizeMenuLayout = (nodes: MenuLayoutNode[], seen = new Set<NavItemKey>()): MenuLayoutNode[] => {
  const result: MenuLayoutNode[] = [];
  nodes.forEach((node) => {
    if (node.type === 'item') {
      if (!NAV_ITEM_DEFINITIONS[node.key]) return;
      if (seen.has(node.key)) return;
      seen.add(node.key);
      result.push({ id: node.id || node.key, type: 'item', key: node.key });
      return;
    }
    const children = sanitizeMenuLayout(node.children, seen);
    if (children.length === 0) return;
    result.push({
      id: node.id || `group-${Math.random().toString(36).slice(2, 8)}`,
      type: 'group',
      label: node.label || 'Groupe',
      children,
    });
  });
  return result;
};

type RemoveResult = {
  layout: MenuLayoutNode[];
  removed: MenuLayoutNode | null;
  parentId: string | null;
  index: number;
};

const removeNodeFromLayout = (
  nodes: MenuLayoutNode[],
  nodeId: string,
  parentId: string | null = null,
): RemoveResult => {
  const next: MenuLayoutNode[] = [];
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.id === nodeId) {
      const tail = nodes.slice(i + 1).map(cloneMenuNode);
      return {
        layout: [...next, ...tail],
        removed: cloneMenuNode(node),
        parentId,
        index: i,
      };
    }
    if (node.type === 'group') {
      const res = removeNodeFromLayout(node.children, nodeId, node.id);
      if (res.removed) {
        const updatedGroup: MenuLayoutNode = {
          id: node.id,
          type: 'group',
          label: node.label,
          children: res.layout,
        };
        const tail = nodes.slice(i + 1).map(cloneMenuNode);
        return {
          layout: [...next, updatedGroup, ...tail],
          removed: res.removed,
          parentId: res.parentId,
          index: res.index,
        };
      }
    }
    next.push(cloneMenuNode(node));
  }
  return { layout: nodes.map(cloneMenuNode), removed: null, parentId, index: -1 };
};

type InsertResult = {
  layout: MenuLayoutNode[];
  inserted: boolean;
};

const insertNodeRelative = (
  nodes: MenuLayoutNode[],
  targetId: string,
  node: MenuLayoutNode,
  position: 'before' | 'after',
): InsertResult => {
  const next: MenuLayoutNode[] = [];
  let inserted = false;
  for (let i = 0; i < nodes.length; i += 1) {
    const current = nodes[i];
    if (!inserted && current.id === targetId) {
      if (position === 'before') next.push(cloneMenuNode(node));
      next.push(cloneMenuNode(current));
      if (position === 'after') next.push(cloneMenuNode(node));
      inserted = true;
    } else if (!inserted && current.type === 'group') {
      const res = insertNodeRelative(current.children, targetId, node, position);
      if (res.inserted) {
        next.push({ id: current.id, type: 'group', label: current.label, children: res.layout });
        inserted = true;
      } else {
        next.push(cloneMenuNode(current));
      }
    } else {
      next.push(cloneMenuNode(current));
    }
  }
  return { layout: next, inserted };
};

const appendNodeToGroup = (
  nodes: MenuLayoutNode[],
  groupId: string,
  node: MenuLayoutNode,
): InsertResult => {
  const next: MenuLayoutNode[] = [];
  let inserted = false;
  nodes.forEach((current) => {
    if (inserted) {
      next.push(cloneMenuNode(current));
      return;
    }
    if (current.id === groupId && current.type === 'group') {
      next.push({
        id: current.id,
        type: 'group',
        label: current.label,
        children: [...current.children.map(cloneMenuNode), cloneMenuNode(node)],
      });
      inserted = true;
      return;
    }
    if (current.type === 'group') {
      const res = appendNodeToGroup(current.children, groupId, node);
      if (res.inserted) {
        next.push({ id: current.id, type: 'group', label: current.label, children: res.layout });
        inserted = true;
        return;
      }
    }
    next.push(cloneMenuNode(current));
  });
  return { layout: next, inserted };
};

const findNodeById = (nodes: MenuLayoutNode[], nodeId: string): MenuLayoutNode | null => {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    if (node.type === 'group') {
      const found = findNodeById(node.children, nodeId);
      if (found) return found;
    }
  }
  return null;
};

const nodeContainsId = (node: MenuLayoutNode, searchId: string): boolean => {
  if (node.id === searchId) return true;
  if (node.type === 'group') {
    return node.children.some((child) => nodeContainsId(child, searchId));
  }
  return false;
};

const isAncestor = (nodes: MenuLayoutNode[], ancestorId: string, possibleDescendantId: string): boolean => {
  const ancestor = findNodeById(nodes, ancestorId);
  if (!ancestor) return false;
  if (ancestor.id === possibleDescendantId) return true;
  if (ancestor.type !== 'group') return false;
  return ancestor.children.some((child) => nodeContainsId(child, possibleDescendantId));
};

const updateGroupLabelInLayout = (nodes: MenuLayoutNode[], groupId: string, label: string): MenuLayoutNode[] => {
  return nodes.map((node) => {
    if (node.type === 'group') {
      if (node.id === groupId) {
        return {
          id: node.id,
          type: 'group',
          label,
          children: node.children.map(cloneMenuNode),
        };
      }
      return {
        id: node.id,
        type: 'group',
        label: node.label,
        children: updateGroupLabelInLayout(node.children, groupId, label),
      };
    }
    return cloneMenuNode(node);
  });
};

const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }>
  = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    onClick={() => {
      if (!disabled) onChange(!checked);
    }}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${checked ? 'bg-blue-600' : 'bg-gray-200'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    aria-pressed={checked}
    aria-disabled={disabled}
    disabled={disabled}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`}
    />
    {label && <span className="sr-only">{label}</span>}
  </button>
);

const ColorSwatch: React.FC<{ color: string; selected: boolean; onSelect: () => void; title?: string }>
  = ({ color, selected, onSelect, title }) => (
  <button
    type="button"
    onClick={onSelect}
    title={title}
    className={`h-8 w-8 rounded-full border-2 ${selected ? 'border-gray-900' : 'border-white'} shadow ring-1 ring-black/5`}
    style={{ backgroundColor: color }}
    aria-pressed={selected}
  />
);

const SectionTitle: React.FC<{ title: string; description?: string }>
  = ({ title, description }) => (
  <div className="mb-4">
    <h3 className="text-sm font-medium text-gray-900">{title}</h3>
    {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
  </div>
);

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face&auto=format';

const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { t, language: uiLanguage, setLanguage: setUiLanguage } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [active, setActive] = useState<TabId>(() => {
    const t = searchParams.get('tab');
    return isTabId(t) ? t : 'account';
  });

  // Local state, decorative only
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const lastAvatarPreviewUrl = useRef<string | null>(null);

  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    try {
      return (localStorage.getItem('ui_theme') as any) || 'system';
    } catch { return 'system'; }
  });
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'spacious'>(() => {
    try {
      return (localStorage.getItem('ui_density') as any) || 'comfortable';
    } catch { return 'comfortable'; }
  });
  const [accent, setAccent] = useState('#2563eb');
  const [navigationColors, setNavigationColors] = useState<NavigationColorConfig>(() => getNavigationColors());
  const [navThemePreset, setNavThemePreset] = useState<NavThemePreset>(() => getNavThemePreset());
  const [reduceMotion, setReduceMotion] = useState(false);
  const [showAvatars, setShowAvatars] = useState(true);
  const [tabMode, setTabMode] = useState(() => {
    try { return localStorage.getItem('or_tab_mode') === 'true'; } catch { return false; }
  });

  const [language, setLanguagePref] = useState<'fr' | 'en'>(() => (uiLanguage === 'en' ? 'en' : 'fr'));
  const [mondayFirst, setMondayFirst] = useState(true);
  const [time24h, setTime24h] = useState(true);
  const [numberFormat, setNumberFormat] = useState<'fr-FR' | 'en-US' | 'es-ES'>('fr-FR');

  const [notifEnabled, setNotifEnabled] = useState(true);
  const [notifApp, setNotifApp] = useState(true);
  const [notifEmail, setNotifEmail] = useState(false);
  const [notifSMS, setNotifSMS] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [sendingDemoNotification, setSendingDemoNotification] = useState(false);
  const notificationChannelSummary = useMemo(() => {
    const channels: string[] = [];
    if (notifApp) channels.push(t('settings.notifications.channels.app'));
    if (notifEmail) channels.push(t('settings.notifications.channels.email'));
    if (notifSMS) channels.push(t('settings.notifications.channels.sms'));
    if (channels.length === 0) return t('settings.notifications.preview.none');
    if (channels.length === 1) return channels[0];
    const last = channels.pop();
    return `${channels.join(', ')} ${t('settings.notifications.preview.and')} ${last}`;
  }, [notifApp, notifEmail, notifSMS, t]);
  const notificationPreviewText = useMemo(() => {
    if (notificationChannelSummary === t('settings.notifications.preview.none')) {
      return t('settings.notifications.preview.messageNone');
    }
    return t('settings.notifications.preview.message', { channels: notificationChannelSummary });
  }, [notificationChannelSummary, t]);

  const updateNavigationColor = (key: keyof NavigationColorConfig, value: string) => {
    setNavigationColors((prev) => normalizeNavigationColors({ ...prev, [key]: value }));
  };

  useEffect(() => {
    try {
      applyNavigationColors(navigationColors, true);
    } catch {
      // Keep settings screen usable even if CSS variable updates fail.
    }
  }, [navigationColors]);

  const handleSendDemoNotification = async () => {
    if (!user?.id) {
      toast.error(t('settings.notifications.demo.errorNoUser'));
      return;
    }

    setSendingDemoNotification(true);
    try {
      await createNotification({
        type: 'info',
        title: t('settings.notifications.demo.notificationTitle'),
        message: t('settings.notifications.demo.notificationMessage'),
        actionLabel: t('settings.notifications.demo.notificationActionLabel'),
        actionUrl: '/settings',
        recipientId: user.id,
        metadata: {
          createdAt: new Date().toISOString(),
          source: 'settings-demo',
        },
      });

      toast.success(t('settings.notifications.demo.success'));
    } catch (error) {
      console.error('Unable to create demo notification', error);
      toast.error(t('settings.notifications.demo.error'));
    } finally {
      setSendingDemoNotification(false);
    }
  };

  const [twoFA, setTwoFA] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorEnabledAt, setTwoFactorEnabledAt] = useState<string | null>(null);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpEnabledAt, setTotpEnabledAt] = useState<string | null>(null);
  const [totpSetupSecret, setTotpSetupSecret] = useState<string | null>(null);
  const [totpSetupUrl, setTotpSetupUrl] = useState<string | null>(null);
  const [totpSetupQr, setTotpSetupQr] = useState<string | null>(null);
  const [totpSetupCode, setTotpSetupCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpInfo, setTotpInfo] = useState<string | null>(null);
  const [currPwd, setCurrPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  const [menuLayoutConfig, setMenuLayoutConfig] = useState<MenuLayoutNode[]>(() => cloneMenuLayout(DEFAULT_MENU_LAYOUT));
  const [draggedMenuId, setDraggedMenuId] = useState<string | null>(null);


  const handleTabChange = (nextTab: TabId) => {
    setActive(nextTab);
    setSearchParams({ tab: nextTab }, { replace: true });
  };

  const createGroupId = () => (globalThis.crypto?.randomUUID?.() ?? `group-${Math.random().toString(36).slice(2, 10)}`);

  const effectiveMenuLayout = useMemo<MenuLayoutNode[]>(
    () => (Array.isArray(menuLayoutConfig) ? menuLayoutConfig : cloneMenuLayout(DEFAULT_MENU_LAYOUT)),
    [menuLayoutConfig]
  );

  const usedNavKeys = useMemo(() => new Set(flattenMenuLayout(effectiveMenuLayout)), [effectiveMenuLayout]);
  const availableNavItems = useMemo(
    () => Object.values(NAV_ITEM_DEFINITIONS).filter((def) => !usedNavKeys.has(def.key)),
    [usedNavKeys]
  );

  const handleAddMenuItem = (key: NavItemKey) => {
    setMenuLayoutConfig((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      if (flattenMenuLayout(current).includes(key)) {
        return prev;
      }
      return [...cloneMenuLayout(current), { id: key, type: 'item', key }];
    });
  };

  const handleAddGroup = () => {
    setMenuLayoutConfig((prev) => [
      ...cloneMenuLayout(Array.isArray(prev) ? prev : []),
      {
        id: createGroupId(),
        type: 'group',
        label: t('settings.navigation.newGroupLabel'),
        children: [],
      },
    ]);
  };

  const handleRemoveNode = (nodeId: string) => {
    const res = removeNodeFromLayout(effectiveMenuLayout, nodeId);
    if (!res.removed) return;
    if (res.removed.type === 'group' && res.removed.children.length > 0) {
      const confirmRemove = window.confirm(t('settings.navigation.confirmRemoveGroup'));
      if (!confirmRemove) return;
    }
    setMenuLayoutConfig(res.layout);
  };

  const handleGroupLabelChange = (groupId: string, label: string) => {
    setMenuLayoutConfig((prev) => updateGroupLabelInLayout(prev, groupId, label));
  };

  const handleDragStart = (nodeId: string) => (event: React.DragEvent<HTMLDivElement>) => {
    setDraggedMenuId(nodeId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
  };

  const handleDragEnd = () => setDraggedMenuId(null);

  const allowDrop = (event: React.DragEvent) => {
    if (!draggedMenuId) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDropBefore = (targetId: string) => (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedMenuId || draggedMenuId === targetId) return;
    if (isAncestor(effectiveMenuLayout, draggedMenuId, targetId)) return;
    const res = removeNodeFromLayout(effectiveMenuLayout, draggedMenuId);
    if (!res.removed) return;
    const insert = insertNodeRelative(res.layout, targetId, res.removed, 'before');
    if (insert.inserted) {
      setMenuLayoutConfig(insert.layout);
    } else {
      setMenuLayoutConfig(res.layout);
    }
    setDraggedMenuId(null);
  };

  const handleDropIntoGroup = (groupId: string) => (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedMenuId) return;
    if (isAncestor(effectiveMenuLayout, draggedMenuId, groupId)) return;
    const draggedNode = findNodeById(effectiveMenuLayout, draggedMenuId);
    if (draggedNode?.type === 'group') {
      setDraggedMenuId(null);
      return;
    }
    const res = removeNodeFromLayout(effectiveMenuLayout, draggedMenuId);
    if (!res.removed) return;
    const insert = appendNodeToGroup(res.layout, groupId, res.removed);
    if (insert.inserted) {
      setMenuLayoutConfig(insert.layout);
    } else {
      // fallback: append at end if insertion failed
      setMenuLayoutConfig([...res.layout, res.removed]);
    }
    setDraggedMenuId(null);
  };

  const handleDropAtEnd = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedMenuId) return;
    const res = removeNodeFromLayout(effectiveMenuLayout, draggedMenuId);
    if (!res.removed) return;
    setMenuLayoutConfig([...res.layout, res.removed]);
    setDraggedMenuId(null);
  };

  const handleDropAtStart = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedMenuId) return;
    const res = removeNodeFromLayout(effectiveMenuLayout, draggedMenuId);
    if (!res.removed) return;
    setMenuLayoutConfig([res.removed, ...res.layout]);
    setDraggedMenuId(null);
  };

  const handleResetMenu = () => {
    const confirmReset = window.confirm(t('settings.navigation.confirmReset'));
    if (!confirmReset) return;
    setMenuLayoutConfig(cloneMenuLayout(DEFAULT_MENU_LAYOUT));
  };

  const renderMenuNode = (node: MenuLayoutNode): React.ReactNode => {
    const dropZone = (
      <div
        key={`${node.id}-drop-zone`}
        className={`h-2 rounded border border-dashed ${draggedMenuId && draggedMenuId !== node.id ? 'border-blue-300 bg-blue-100/30' : 'border-transparent'}`}
        onDragOver={allowDrop}
        onDrop={handleDropBefore(node.id)}
      />
    );

    if (node.type === 'item') {
      const def = NAV_ITEM_DEFINITIONS[node.key];
      if (!def) return null;
      return (
        <React.Fragment key={node.id}>
          {dropZone}
          <div
            className={`flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 transition-all duration-100 cursor-grab active:cursor-grabbing ${draggedMenuId === node.id ? 'opacity-50 ring-2 ring-blue-400 shadow-md' : 'hover:border-gray-200 hover:shadow-sm'}`}
            draggable
            onDragStart={handleDragStart(node.id)}
            onDragEnd={handleDragEnd}
          >
            <div className="flex items-center gap-3">
              <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
              <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-gray-100 flex-shrink-0">
                <def.icon className="h-3.5 w-3.5 text-gray-500" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-800">{def.name}</div>
                <div className="text-[11px] text-gray-400">{def.href}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRemoveNode(node.id)}
              className="h-6 w-6 flex items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
              title={t('settings.navigation.removeItem')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </React.Fragment>
      );
    }

    const children = node.children.map((child) => renderMenuNode(child));

    return (
      <React.Fragment key={node.id}>
        {dropZone}
        <div
          className={`rounded-xl border border-gray-100 bg-white overflow-hidden transition-all duration-100 ${draggedMenuId === node.id ? 'opacity-50 ring-2 ring-blue-400 shadow-md' : 'hover:border-gray-200'}`}
          draggable
          onDragStart={handleDragStart(node.id)}
          onDragEnd={handleDragEnd}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
            <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-gray-900 flex-shrink-0">
              <MenuIcon className="h-3.5 w-3.5 text-white" />
            </div>
            <input
              value={node.label}
              onChange={(e) => handleGroupLabelChange(node.id, e.target.value)}
              className="flex-1 border-0 bg-transparent px-0 py-0 text-sm font-medium text-gray-800 focus:outline-none focus:ring-0 placeholder-gray-300"
              placeholder={t('settings.navigation.groupPlaceholder')}
            />
            <button
              type="button"
              onClick={() => handleRemoveNode(node.id)}
              className="h-6 w-6 flex items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
              title={t('settings.navigation.removeGroup')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div
            className="p-2 space-y-1.5 bg-gray-50/60 min-h-[40px]"
            onDragOver={allowDrop}
            onDrop={handleDropIntoGroup(node.id)}
          >
            {children.length > 0 ? children : (
              <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2.5 text-xs text-gray-400 text-center">
                {t('settings.navigation.groupEmpty')}
              </div>
            )}
          </div>
        </div>
      </React.Fragment>
    );
  };

  const localePreview = useMemo(() => {
    const now = new Date('2025-03-14T15:09:26');
    const date = new Intl.DateTimeFormat(language, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: !time24h
    }).format(now);
    const num = new Intl.NumberFormat(numberFormat, { style: 'currency', currency: 'EUR' }).format(1234567.89);
    return { date, num };
  }, [language, time24h, numberFormat]);

  const twoFactorEnabledAtDisplay = twoFactorEnabledAt
    ? new Date(twoFactorEnabledAt).toLocaleString(language === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'long', timeStyle: 'short' })
    : null;
  const totpEnabledAtDisplay = totpEnabledAt
    ? new Date(totpEnabledAt).toLocaleString(language === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'long', timeStyle: 'short' })
    : null;
  const totpSetupInProgress = Boolean(totpSetupSecret && totpSetupUrl && totpSetupQr);
  const [sessionLogs, setSessionLogs] = useState<Array<{
    id: string;
    method: string;
    created_at: string;
    success: boolean;
    ip_address: string | null;
    user_agent: string | null;
    location: string | null;
  }>>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const sessionDateFormatter = useMemo(() => new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }), [language]);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      try {
        const response = await fetch(`/api/auth/two-factor/${user.id}`);
        if (response.ok) {
          const payload = await response.json();
          setTwoFA(!!payload?.two_factor_email_enabled);
          setTwoFactorEnabledAt(payload?.two_factor_enabled_at || null);
          setTotpEnabled(!!payload?.two_factor_totp_enabled);
          setTotpEnabledAt(payload?.two_factor_totp_enabled_at || null);
        }
      } catch (err) {
        console.error('[settings] two-factor load failed', err);
      }
      try {
        setSessionLoading(true);
        const response = await fetch(`/api/auth/two-factor/${user?.id}/logs`);
        if (response?.ok) {
          const payload = await response.json();
          setSessionLogs(Array.isArray(payload?.logs) ? payload.logs : []);
        } else {
          setSessionLogs([]);
        }
      } catch (err) {
        console.error('[settings] session logs load failed', err);
        setSessionLogs([]);
      } finally {
        setSessionLoading(false);
      }
      // Load base user
      const { data: u } = await supabase
        .from('app_users')
        .select('email, full_name, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (u) {
        setEmail(u.email || '');
        const parts = (u.full_name || '').trim().split(' ');
        setFirstName(parts.slice(0, -1).join(' ') || (u.full_name || ''));
        setLastName(parts.slice(-1).join(' '));
        setAvatar(u.avatar_url || DEFAULT_AVATAR);
      }
      // Load profile
      const { data: prof } = await supabase.from('app_user_profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (prof) {
        setPhone(prof.phone || '');
        setJobTitle(prof.job_title || '');
        setCompany(prof.company || '');
        setLocation(prof.location || '');
        setBio(prof.bio || '');
      }
      // Load preferences (excluding theme which is local)
      const { data: prefsRow } = await supabase.from('app_user_preferences').select('preferences').eq('user_id', user.id).maybeSingle();
      const prefs: any = prefsRow?.preferences || {};
      // theme remains local
      // density remains local
      if (prefs.accent) setAccent(prefs.accent);
      if (typeof prefs.reduceMotion === 'boolean') setReduceMotion(prefs.reduceMotion);
      if (typeof prefs.showAvatars === 'boolean') setShowAvatars(prefs.showAvatars);
      if (typeof prefs.tabMode === 'boolean') {
        setTabMode(prefs.tabMode);
        try { localStorage.setItem('or_tab_mode', String(prefs.tabMode)); } catch {}
      }
      if (prefs.language && (prefs.language === 'en' || prefs.language === 'fr')) {
        setLanguagePref(prefs.language);
        setUiLanguage(prefs.language);
      }
      if (typeof prefs.mondayFirst === 'boolean') setMondayFirst(prefs.mondayFirst);
      if (typeof prefs.time24h === 'boolean') setTime24h(prefs.time24h);
      if (prefs.numberFormat) setNumberFormat(prefs.numberFormat);
      if (typeof prefs.notifEnabled === 'boolean') setNotifEnabled(prefs.notifEnabled);
      if (typeof prefs.notifApp === 'boolean') setNotifApp(prefs.notifApp);
      if (typeof prefs.notifEmail === 'boolean') setNotifEmail(prefs.notifEmail);
      if (typeof prefs.notifSMS === 'boolean') setNotifSMS(prefs.notifSMS);
      if (prefs.quietStart) setQuietStart(prefs.quietStart);
      if (prefs.quietEnd) setQuietEnd(prefs.quietEnd);
      if (prefs.navigationColors) {
        setNavigationColors(normalizeNavigationColors(prefs.navigationColors));
      }
      if (prefs.menuLayout) {
        setMenuLayoutConfig(normalizeMenuLayout(prefs.menuLayout));
      } else {
        setMenuLayoutConfig(cloneMenuLayout(DEFAULT_MENU_LAYOUT));
      }
      // Load appearance (accent) from dedicated table
      const { data: app } = await supabase.from('app_user_appearance').select('accent').eq('user_id', user.id).maybeSingle();
      if (app?.accent) {
        setAccent(app.accent);
        document.documentElement.style.setProperty('--accent', app.accent);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    return () => {
      if (lastAvatarPreviewUrl.current) {
        URL.revokeObjectURL(lastAvatarPreviewUrl.current);
      }
    };
  }, []);

  const handleAvatarUpload = async (file: File) => {
    if (!user?.id) {
      toast.error(t('settings.account.avatar.error.userMissing'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('settings.account.avatar.error.invalidType'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('settings.account.avatar.error.tooLarge'));
      return;
    }

    const previousAvatar = avatar || DEFAULT_AVATAR;

    if (lastAvatarPreviewUrl.current) {
      URL.revokeObjectURL(lastAvatarPreviewUrl.current);
      lastAvatarPreviewUrl.current = null;
    }
    const previewUrl = URL.createObjectURL(file);
    lastAvatarPreviewUrl.current = previewUrl;
    setAvatar(previewUrl);
    setAvatarUploading(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const result = reader.result as string | ArrayBuffer | null;
          const base64 = typeof result === 'string' ? result.split(',').pop() : null;
          if (!base64) throw new Error(t('settings.account.avatar.error.decode'));
          const response = await fetch('/api/profile/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              filename: `${Date.now()}.${ext}`,
              contentType: file.type,
              data: base64,
            }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.error || t('settings.account.avatar.error.generic'));
          }
          const publicUrl = payload?.url;
          if (typeof publicUrl !== 'string' || !publicUrl) {
            throw new Error(t('settings.account.avatar.error.missingUrl'));
          }
          setAvatar(publicUrl);
        } catch (err) {
          console.error('Avatar upload failed', err);
          const message = err instanceof Error ? err.message : t('settings.account.avatar.error.generic');
          toast.error(message);
          setAvatar(previousAvatar);
        } finally {
          setAvatarUploading(false);
          if (lastAvatarPreviewUrl.current) {
            URL.revokeObjectURL(lastAvatarPreviewUrl.current);
            lastAvatarPreviewUrl.current = null;
          }
        }
      };
      reader.onerror = () => {
        setAvatarUploading(false);
        setAvatar(previousAvatar);
        toast.error(t('settings.account.avatar.error.read'));
      };
      reader.readAsDataURL(file);
      return;
    } catch (err: any) {
      console.error('Avatar upload failed', err);
      const bucketMissing = err?.message?.toLowerCase?.().includes('bucket not found');
      if (bucketMissing) {
        toast.error(t('settings.account.avatar.error.bucketMissing'));
      } else {
        toast.error(t('settings.account.avatar.error.generic'));
      }
      setAvatar(previousAvatar);
      setAvatarUploading(false);
      if (lastAvatarPreviewUrl.current) {
        URL.revokeObjectURL(lastAvatarPreviewUrl.current);
        lastAvatarPreviewUrl.current = null;
      }
    }
  };

  const handleToggleTwoFactor = async () => {
    if (!user?.id) {
      toast.error(t('settings.security.error.userMissing'));
      return;
    }
    setTwoFactorLoading(true);
    const next = !twoFA;
    try {
      const { error } = await supabase.rpc('set_two_factor_email', {
        p_user_id: user.id,
        p_enabled: next,
      });
      if (error) throw error;
      const { data: refreshed, error: refreshError } = await supabase
        .from('app_users')
        .select('two_factor_email_enabled, two_factor_enabled_at')
        .eq('id', user.id)
        .maybeSingle();
      if (refreshError) throw refreshError;
      setTwoFA(!!refreshed?.two_factor_email_enabled);
      setTwoFactorEnabledAt(refreshed?.two_factor_enabled_at ?? null);
      toast.success(next ? t('settings.security.email2fa.toastEnabled') : t('settings.security.email2fa.toastDisabled'));
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : t('settings.security.error.twoFactorUpdate');
      toast.error(message);
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleStartTotpSetup = async () => {
    if (!user?.id) {
      toast.error(t('settings.security.error.userMissing'));
      return;
    }
    setTotpLoading(true);
    setTotpError(null);
    setTotpInfo(null);
    try {
      const response = await fetch('/api/auth/totp/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || t('settings.security.totp.error.start'));
      }
      setTotpSetupSecret(payload?.secret ?? null);
      setTotpSetupUrl(payload?.otpauth_url ?? null);
      setTotpSetupQr(payload?.qr_url ?? null);
      setTotpSetupCode('');
      setTotpInfo(t('settings.security.totpSetup.info'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('settings.security.totp.error.start');
      setTotpError(message);
    } finally {
      setTotpLoading(false);
    }
  };

  const handleConfirmTotpSetup = async () => {
    if (!user?.id) {
      toast.error(t('settings.security.error.userMissing'));
      return;
    }
    const sanitized = totpSetupCode.trim();
    if (!/^[0-9]{6}$/.test(sanitized)) {
      setTotpError(t('settings.security.totpSetup.codeRequired'));
      return;
    }
    setTotpLoading(true);
    setTotpError(null);
    try {
      const response = await fetch('/api/auth/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, code: sanitized }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || t('settings.security.totp.error.verify'));
      }
      setTotpEnabled(true);
      setTotpEnabledAt(new Date().toISOString());
      setTotpSetupSecret(null);
      setTotpSetupUrl(null);
      setTotpSetupQr(null);
      setTotpSetupCode('');
      setTotpInfo(null);
      setTotpError(null);
      toast.success(t('settings.security.totp.toastEnabled'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('settings.security.totp.error.verify');
      setTotpError(message);
    } finally {
      setTotpLoading(false);
    }
  };

  const handleCancelTotpSetup = async () => {
    if (!user?.id) {
      setTotpSetupSecret(null);
      setTotpSetupUrl(null);
      setTotpSetupQr(null);
      setTotpSetupCode('');
      setTotpInfo(null);
      setTotpError(null);
      return;
    }
    setTotpLoading(true);
    setTotpError(null);
    try {
      await fetch('/api/auth/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t('settings.security.totp.error.cancel');
      setTotpError(message);
    } finally {
      setTotpLoading(false);
      setTotpSetupSecret(null);
      setTotpSetupUrl(null);
      setTotpSetupQr(null);
      setTotpSetupCode('');
      setTotpInfo(null);
      setTotpError(null);
    }
  };

  const handleDisableTotp = async () => {
    if (!user?.id) {
      toast.error(t('settings.security.error.userMissing'));
      return;
    }
    setTotpLoading(true);
    setTotpError(null);
    try {
      const response = await fetch('/api/auth/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || t('settings.security.totp.error.disable'));
      }
      setTotpEnabled(false);
      setTotpEnabledAt(null);
      setTotpSetupSecret(null);
      setTotpSetupUrl(null);
      setTotpSetupQr(null);
      setTotpSetupCode('');
      setTotpInfo(null);
      setTotpError(null);
      toast.success(t('settings.security.totp.toastDisabled'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('settings.security.totp.error.disable');
      setTotpError(message);
    } finally {
      setTotpLoading(false);
    }
  };

  const handleToggleTotp = async (nextValue: boolean) => {
    if (totpLoading) return;
    if (!user?.id) {
      toast.error(t('settings.security.error.userMissing'));
      return;
    }
    if (!nextValue) {
      if (totpEnabled) {
        await handleDisableTotp();
      } else {
        await handleCancelTotpSetup();
      }
    } else {
      await handleStartTotpSetup();
    }
  };

  const save = async () => {
    if (!user?.id) return;
    try {
      const sanitizedLayout = sanitizeMenuLayout(effectiveMenuLayout);
      setMenuLayoutConfig(sanitizedLayout);
      // Update app_users
      const full_name = [firstName, lastName].filter(Boolean).join(' ').trim() || firstName || lastName;
      const persistedAvatar = avatar && avatar !== DEFAULT_AVATAR ? avatar : null;
      const { error: uErr } = await supabase.from('app_users').update({ email, full_name, avatar_url: persistedAvatar }).eq('id', user.id);
      if (uErr) throw uErr;
      setCookie('or_email', email, 7);
      setCookie('or_name', full_name || '', 7);

      // Upsert profile
      const profilePayload = { user_id: user.id, phone: phone || null, job_title: jobTitle || null, company: company || null, location: location || null, bio: bio || null };
      const { error: pErr } = await supabase.from('app_user_profiles').upsert(profilePayload, { onConflict: 'user_id' });
      if (pErr) throw pErr;

      // Upsert preferences JSON (theme is local only)
      const preferences = {
        density, reduceMotion, showAvatars, tabMode,
        language, mondayFirst, time24h, numberFormat,
        notifEnabled, notifApp, notifEmail, notifSMS, quietStart, quietEnd,
        navigationColors: normalizeNavigationColors(navigationColors),
        menuLayout: sanitizedLayout,
      };
      const { error: prErr } = await supabase.from('app_user_preferences').upsert({ user_id: user.id, preferences }, { onConflict: 'user_id' });
      if (prErr) throw prErr;

      // Persist tab mode to localStorage and notify listeners
      try { localStorage.setItem('or_tab_mode', String(tabMode)); } catch {}
      window.dispatchEvent(new Event('or-tab-mode-changed'));

      // Upsert appearance (accent)
      const { error: aErr } = await supabase.from('app_user_appearance').upsert({ user_id: user.id, accent }, { onConflict: 'user_id' });
      if (aErr) throw aErr;

      // Apply accent globally and persist locally for faster boot
      document.documentElement.style.setProperty('--accent', accent);
      try { localStorage.setItem('ui_theme', theme); } catch {}
      try { localStorage.setItem('ui_density', density); } catch {}
      applyNavigationColors(navigationColors, true);

      window.dispatchEvent(new Event('user-menu-updated'));

      toast.success(t('settings.save.success'), { icon: <CheckCircle2 className="text-emerald-500" /> as any });
    } catch (e: any) {
      console.error(e);
      toast.error(t('settings.save.error'));
    }
  };

  const activeTabDef = tabs.find(t => t.id === active);

  return (
    <div className="flex gap-5 items-start min-h-[calc(100vh-7rem)]">

      {/* ── Left sidebar ── */}
      <aside className="hidden md:flex flex-col w-60 flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-0 self-start">

        {/* User mini-profile */}
        <div className="px-4 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <img
              src={avatar || DEFAULT_AVATAR}
              alt="avatar"
              className="h-9 w-9 rounded-full object-cover ring-2 ring-gray-100 shadow-sm flex-shrink-0"
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {[firstName, lastName].filter(Boolean).join(' ') || 'Utilisateur'}
              </div>
              <div className="text-xs text-gray-400 truncate">{email || ''}</div>
            </div>
          </div>
        </div>

        {/* Tab nav */}
        <nav className="flex-1 p-2 space-y-0.5">
          {tabs.map((tabItem) => {
            const Icon = tabItem.icon;
            const isActive = active === tabItem.id;
            return (
              <button
                key={tabItem.id}
                type="button"
                onClick={() => handleTabChange(tabItem.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-100 group ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                }`}
              >
                <div className={`flex items-center justify-center h-7 w-7 rounded-lg flex-shrink-0 transition-colors ${
                  isActive ? 'bg-white/10' : 'bg-gray-100 group-hover:bg-gray-200'
                }`}>
                  <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'}`} />
                </div>
                <span className="text-sm font-medium">{t(tabItem.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        {/* Save */}
        <div className="p-3 border-t border-gray-100">
          <button
            type="button"
            onClick={save}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold shadow-sm transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            {t('common.save')}
          </button>
        </div>
      </aside>

      {/* ── Right content ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">

        {/* Mobile save */}
        <div className="md:hidden flex justify-end">
          <button
            type="button"
            onClick={save}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold"
          >
            {t('common.save')}
          </button>
        </div>

        {/* ── Account tab ── special layout */}
        {active === 'account' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

            {/* Cover photo */}
            <div className="relative h-32 bg-gradient-to-br from-slate-800 via-slate-700 to-blue-900 overflow-hidden">
              <div className="absolute inset-0" style={{
                backgroundImage: "radial-gradient(circle at 20% 50%, rgba(59,130,246,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(99,102,241,0.3) 0%, transparent 40%)",
              }} />
            </div>

            {/* Avatar row */}
            <div className="px-6">
              <div className="flex items-end justify-between -mt-10 mb-1">
                {/* Avatar with upload overlay */}
                <div className="relative group flex-shrink-0">
                  <img
                    src={avatar || DEFAULT_AVATAR}
                    alt={t('settings.account.avatar.alt')}
                    className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white shadow-lg"
                  />
                  <label className={`absolute inset-0 rounded-2xl flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity ${avatarUploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    {avatarUploading
                      ? <div className="h-5 w-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <Upload className="h-5 w-5 text-white" />
                    }
                    <input type="file" accept="image/*" className="hidden" disabled={avatarUploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleAvatarUpload(f); e.target.value = ''; } }} />
                  </label>
                </div>
                {/* Photo actions */}
                <div className="flex items-center gap-2 mb-1">
                  <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-300 transition-all ${avatarUploading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <Upload className="h-3 w-3" />
                    Modifier la photo
                    <input type="file" accept="image/*" className="hidden" disabled={avatarUploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleAvatarUpload(f); e.target.value = ''; } }} />
                  </label>
                  <button type="button" onClick={() => setAvatar(DEFAULT_AVATAR)} disabled={avatarUploading}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-40">
                    {t('settings.account.avatar.reset')}
                  </button>
                </div>
              </div>

              {/* Name + role */}
              <div className="mb-5">
                <div className="text-xl font-bold text-gray-900">
                  {[firstName, lastName].filter(Boolean).join(' ') || 'Utilisateur'}
                </div>
                {(jobTitle || email) && (
                  <div className="text-sm text-gray-400 mt-0.5">
                    {[jobTitle, email].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* Form */}
            <div className="px-6 py-6 space-y-6">
              {/* Personal info */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Informations personnelles</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.account.fields.firstName')}</label>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                      className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.account.fields.lastName')}</label>
                    <input value={lastName} onChange={(e) => setLastName(e.target.value)}
                      className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.account.fields.email')}</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.account.fields.phone')}</label>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* Professional info */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Informations professionnelles</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.account.fields.jobTitle')}</label>
                    <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
                      className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.account.fields.company')}</label>
                    <input value={company} onChange={(e) => setCompany(e.target.value)}
                      className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.account.fields.location')}</label>
                    <input value={location} onChange={(e) => setLocation(e.target.value)}
                      className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">{t('settings.account.fields.bio')}</label>
                    <textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)}
                      className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none resize-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Other tabs ── */}
        {active !== 'account' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            {activeTabDef && <activeTabDef.icon className="h-5 w-5 text-blue-600" />}
            <h2 className="text-base font-semibold text-gray-900">
              {activeTabDef ? t(activeTabDef.labelKey) : t('settings.header.title')}
            </h2>
          </div>
          <div className="p-6 space-y-8">

          {active === 'appearance' && (
            <div className="-m-6">
              <div className="flex min-h-[420px]">

                {/* ── Live preview ── */}
                <div className="w-[52%] flex-shrink-0 bg-gray-100/60 border-r border-gray-100 p-6 flex flex-col gap-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Aperçu en direct</p>

                  {theme === 'system' ? (
                    /* ── Système : deux mini-maquettes côte à côte ── */
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                      <div className="flex items-stretch gap-3 w-full">
                        {/* Light */}
                        {(() => {
                          const dark = false;
                          return (
                            <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">
                              <div className="h-5 flex items-center px-2 gap-1.5 flex-shrink-0" style={{ background: navigationColors.topbarBackground }}>
                                <div className="h-1 w-10 rounded-full opacity-40" style={{ background: navigationColors.topbarText }} />
                              </div>
                              <div className="flex flex-1" style={{ minHeight: 100 }}>
                                <div className="w-8 flex flex-col gap-0.5 px-1 py-1.5" style={{ background: navigationColors.sidebarBackground }}>
                                  {[0,1,2,3].map((i) => (
                                    <div key={i} className="h-3 rounded flex items-center gap-0.5 px-0.5" style={{ background: i===1 ? accent+'22':'transparent' }}>
                                      <div className="h-1.5 w-1.5 rounded-sm flex-shrink-0" style={{ background: i===1?accent:navigationColors.sidebarText, opacity: i===1?0.9:0.25 }} />
                                      <div className="h-0.5 flex-1 rounded-full" style={{ background: i===1?accent:navigationColors.sidebarText, opacity: i===1?0.6:0.15 }} />
                                    </div>
                                  ))}
                                </div>
                                <div className="flex-1 p-2 flex flex-col gap-1.5" style={{ background: '#ffffff' }}>
                                  <div className="h-1.5 w-12 rounded-full bg-gray-200" />
                                  <div className="grid grid-cols-2 gap-1">
                                    {[0,1].map(i => (
                                      <div key={i} className="rounded p-1.5 flex flex-col gap-1 bg-gray-50">
                                        <div className="h-1 w-full rounded-full bg-gray-200" />
                                        <div className="h-2 w-1/2 rounded" style={{ background: i===0?accent:'#e5e7eb', opacity: i===0?0.8:1 }} />
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-auto flex gap-1">
                                    <div className="h-3.5 px-1.5 rounded flex items-center" style={{ background: accent }}>
                                      <div className="h-0.5 w-5 rounded-full bg-white opacity-80" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="px-2 py-1 bg-white border-t border-gray-100 flex items-center justify-center gap-1">
                                <svg className="h-2.5 w-2.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 1.78a1 1 0 011.415 1.415l-.707.707a1 1 0 11-1.414-1.414l.707-.708zM18 9a1 1 0 110 2h-1a1 1 0 110-2h1zM4.636 15.364a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM3 10a1 1 0 110 2H2a1 1 0 110-2h1zm13.364-5.636a1 1 0 00-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707zM5.636 4.636a1 1 0 10-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707zM10 6a4 4 0 100 8 4 4 0 000-8z"/></svg>
                                <span className="text-[9px] text-gray-400 font-medium">Clair</span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Arrow */}
                        <div className="flex flex-col items-center justify-center gap-1 flex-shrink-0">
                          <div className="text-gray-300 text-base">⇄</div>
                          <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-widest">Auto</span>
                        </div>

                        {/* Dark */}
                        {(() => {
                          return (
                            <div className="flex-1 rounded-xl overflow-hidden border border-gray-700 shadow-sm flex flex-col">
                              <div className="h-5 flex items-center px-2 gap-1.5 flex-shrink-0" style={{ background: navigationColors.topbarBackground }}>
                                <div className="h-1 w-10 rounded-full opacity-40" style={{ background: navigationColors.topbarText }} />
                              </div>
                              <div className="flex flex-1" style={{ minHeight: 100 }}>
                                <div className="w-8 flex flex-col gap-0.5 px-1 py-1.5" style={{ background: navigationColors.sidebarBackground }}>
                                  {[0,1,2,3].map((i) => (
                                    <div key={i} className="h-3 rounded flex items-center gap-0.5 px-0.5" style={{ background: i===1 ? accent+'22':'transparent' }}>
                                      <div className="h-1.5 w-1.5 rounded-sm flex-shrink-0" style={{ background: i===1?accent:navigationColors.sidebarText, opacity: i===1?0.9:0.25 }} />
                                      <div className="h-0.5 flex-1 rounded-full" style={{ background: i===1?accent:navigationColors.sidebarText, opacity: i===1?0.6:0.15 }} />
                                    </div>
                                  ))}
                                </div>
                                <div className="flex-1 p-2 flex flex-col gap-1.5" style={{ background: '#1f2937' }}>
                                  <div className="h-1.5 w-12 rounded-full bg-gray-600" />
                                  <div className="grid grid-cols-2 gap-1">
                                    {[0,1].map(i => (
                                      <div key={i} className="rounded p-1.5 flex flex-col gap-1 bg-gray-700">
                                        <div className="h-1 w-full rounded-full bg-gray-600" />
                                        <div className="h-2 w-1/2 rounded" style={{ background: i===0?accent:'#4b5563', opacity: i===0?0.8:1 }} />
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-auto flex gap-1">
                                    <div className="h-3.5 px-1.5 rounded flex items-center" style={{ background: accent }}>
                                      <div className="h-0.5 w-5 rounded-full bg-white opacity-80" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <div className="px-2 py-1 bg-gray-900 border-t border-gray-700 flex items-center justify-center gap-1">
                                <svg className="h-2.5 w-2.5 text-indigo-400" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
                                <span className="text-[9px] text-gray-500 font-medium">Sombre</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <p className="text-[10px] text-gray-400 text-center">S'adapte automatiquement à votre OS</p>
                    </div>

                  ) : (
                    /* ── Live preview clair / sombre ── */
                    <div className="flex-1 rounded-xl overflow-hidden shadow-md border border-black/5 flex flex-col" style={{ minHeight: 260 }}>
                      {/* Topbar */}
                      <div className="h-7 flex items-center px-3 gap-2 flex-shrink-0" style={{ background: navigationColors.topbarBackground }}>
                        <div className="h-2 w-2 rounded-full opacity-50 flex-shrink-0" style={{ background: navigationColors.topbarText }} />
                        <div className="h-1.5 w-14 rounded-full opacity-40" style={{ background: navigationColors.topbarText }} />
                        <div className="flex-1" />
                        <div className="h-4 w-16 rounded opacity-20" style={{ background: navigationColors.topbarText }} />
                        <div className="h-4 w-4 rounded-full opacity-30" style={{ background: navigationColors.topbarText }} />
                      </div>
                      {/* Body */}
                      <div className="flex flex-1 overflow-hidden">
                        <div className="w-14 flex-shrink-0 flex flex-col gap-0.5 px-1.5 py-2" style={{ background: navigationColors.sidebarBackground }}>
                          {[0,1,2,3,4].map((i) => (
                            <div key={i} className="h-5 rounded flex items-center gap-1 px-1" style={{ background: i===1 ? accent+'22':'transparent' }}>
                              <div className="h-2 w-2 rounded-sm flex-shrink-0" style={{ background: i===1?accent:navigationColors.sidebarText, opacity: i===1?0.9:0.3 }} />
                              <div className="h-1 flex-1 rounded-full" style={{ background: i===1?accent:navigationColors.sidebarText, opacity: i===1?0.6:0.2 }} />
                            </div>
                          ))}
                        </div>
                        <div className="flex-1 p-3 flex flex-col gap-2.5" style={{ background: theme==='dark'?'#1f2937':'#ffffff' }}>
                          <div className="h-2.5 w-20 rounded-full" style={{ background: theme==='dark'?'#4b5563':'#e5e7eb' }} />
                          <div className="grid grid-cols-3 gap-2">
                            {[0,1,2].map((i) => (
                              <div key={i} className="rounded-lg p-2 flex flex-col gap-1.5" style={{ background: theme==='dark'?'#374151':'#f9fafb' }}>
                                <div className="h-1.5 w-full rounded-full" style={{ background: theme==='dark'?'#4b5563':'#e5e7eb' }} />
                                <div className="h-3 w-1/2 rounded" style={{ background: i===0?accent:theme==='dark'?'#4b5563':'#e5e7eb', opacity: i===0?0.8:1 }} />
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-col gap-1">
                            {[0,1,2].map((i) => (
                              <div key={i} className="h-4 rounded flex items-center gap-2 px-1.5" style={{ background: i===0?accent+'15':'transparent', borderBottom: `1px solid ${theme==='dark'?'#374151':'#f3f4f6'}` }}>
                                <div className="h-1 w-8 rounded-full" style={{ background: theme==='dark'?'#6b7280':'#d1d5db' }} />
                                <div className="h-1 w-12 rounded-full" style={{ background: theme==='dark'?'#6b7280':'#d1d5db' }} />
                                <div className="flex-1" />
                                <div className="h-2.5 w-8 rounded-full" style={{ background: i===0?accent:theme==='dark'?'#374151':'#e5e7eb', opacity: i===0?0.9:1 }} />
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-1.5 mt-auto">
                            <div className="h-5 px-2 rounded flex items-center" style={{ background: accent }}>
                              <div className="h-1 w-8 rounded-full bg-white opacity-80" />
                            </div>
                            <div className="h-5 px-2 rounded flex items-center border" style={{ borderColor: theme==='dark'?'#4b5563':'#e5e7eb' }}>
                              <div className="h-1 w-6 rounded-full" style={{ background: theme==='dark'?'#6b7280':'#9ca3af' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Controls ── */}
                <div className="flex-1 px-6 py-6 overflow-y-auto flex flex-col gap-6">

                  {/* Thème */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Thème</p>
                    <div className="flex gap-2">
                      {([
                        { id: 'light' as const, label: 'Clair' },
                        { id: 'dark' as const, label: 'Sombre' },
                        { id: 'system' as const, label: 'Système' },
                      ]).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => { setTheme(opt.id); try { applyTheme(opt.id); } catch {} }}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all duration-150 ${
                            theme === opt.id
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Accent */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Couleur d'accent</p>
                    <div className="flex gap-2.5 flex-wrap">
                      {[
                        { color: '#2563eb', name: 'Bleu' },
                        { color: '#9333ea', name: 'Violet' },
                        { color: '#16a34a', name: 'Vert' },
                        { color: '#f59e0b', name: 'Ambre' },
                        { color: '#ef4444', name: 'Rouge' },
                        { color: '#0ea5e9', name: 'Cyan' },
                        { color: '#111827', name: 'Noir' },
                      ].map(({ color, name }) => (
                        <button
                          key={color}
                          type="button"
                          title={name}
                          onClick={() => setAccent(color)}
                          className="h-7 w-7 rounded-full flex items-center justify-center transition-all duration-150"
                          style={{
                            background: color,
                            boxShadow: accent === color ? `0 0 0 2px white, 0 0 0 4px ${color}` : 'none',
                            transform: accent === color ? 'scale(1.15)' : 'scale(1)',
                          }}
                        >
                          {accent === color && (
                            <svg className="h-3 w-3 text-white" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Densité */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Densité</p>
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                      {([
                        { id: 'compact' as const, label: 'Compacte' },
                        { id: 'comfortable' as const, label: 'Normale' },
                        { id: 'spacious' as const, label: 'Spacieuse' },
                      ]).map((opt, i, arr) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => { setDensity(opt.id); try { applyDensity(opt.id); } catch {} }}
                          className={`flex-1 py-1.5 text-xs font-medium transition-all duration-150 ${
                            i < arr.length - 1 ? 'border-r border-gray-200' : ''
                          } ${
                            density === opt.id
                              ? 'bg-gray-900 text-white'
                              : 'bg-white text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Nav theme preset */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Thème nav</p>
                    <div className="flex gap-2">
                      {(Object.entries(NAV_THEME_PRESETS) as [NavThemePreset, typeof NAV_THEME_PRESETS[NavThemePreset]][]).map(([id, preset]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setNavThemePreset(id);
                            try { localStorage.setItem(NAV_THEME_PRESET_STORAGE_KEY, id); } catch {}
                            const colors = preset.colors;
                            setNavigationColors(prev => ({ ...prev, ...colors }));
                            applyNavigationColors(colors);
                          }}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all duration-150 ${
                            navThemePreset === id
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Nav colors */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Couleurs nav</p>
                    <div className="space-y-3">
                      {([
                        { label: 'Sidebar', bgKey: 'sidebarBackground' as const, textKey: 'sidebarText' as const },
                        { label: 'Topbar', bgKey: 'topbarBackground' as const, textKey: 'topbarText' as const },
                      ]).map(({ label, bgKey, textKey }) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">{label}</span>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-400">Fond</span>
                              <ColorPickerButton size="sm" value={navigationColors[bgKey]} onChange={(v) => updateNavigationColor(bgKey, v)} ariaLabel={`Fond ${label}`} />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-400">Texte</span>
                              <ColorPickerButton size="sm" value={navigationColors[textKey]} onChange={(v) => updateNavigationColor(textKey, v)} ariaLabel={`Texte ${label}`} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Interface</p>
                    <div className="space-y-3">
                      {[
                        { label: t('settings.appearance.interface.reduceMotion.title'), checked: reduceMotion, onChange: setReduceMotion },
                        { label: t('settings.appearance.interface.showAvatars.title'), checked: showAvatars, onChange: setShowAvatars },
                        { label: t('settings.appearance.interface.multiWindow.title'), checked: tabMode, onChange: (v: boolean) => { setTabMode(v); try { localStorage.setItem('or_tab_mode', String(v)); } catch {} window.dispatchEvent(new Event('or-tab-mode-changed')); } },
                      ].map(({ label, checked, onChange }) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">{label}</span>
                          <Switch checked={checked} onChange={onChange} />
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}

          {active === 'language' && (
            <div className="space-y-8">

              {/* ── Langue de l'interface ── */}
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">{t('settings.language.languageLabel')}</label>
                <select
                  value={language}
                  onChange={(e) => { const v = e.target.value as 'fr' | 'en'; setLanguagePref(v); setUiLanguage(v); setCookie('or_lang', v, 30); }}
                  className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none"
                >
                  <option value="fr">🇫🇷 Français</option>
                  <option value="en">🇬🇧 English</option>
                </select>
              </div>

              <div className="border-t border-gray-100" />

              {/* ── Format des nombres ── */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">{t('settings.language.numberFormat')}</p>
                <div className="flex gap-3">
                  {([
                    { value: 'fr-FR', label: 'Européen', locale: 'fr-FR' },
                    { value: 'en-US', label: 'Américain', locale: 'en-US' },
                    { value: 'es-ES', label: 'Espagnol', locale: 'es-ES' },
                  ] as const).map((fmt) => {
                    const preview = new Intl.NumberFormat(fmt.locale, { style: 'currency', currency: 'EUR' }).format(1234567.89);
                    return (
                      <button
                        key={fmt.value}
                        type="button"
                        onClick={() => setNumberFormat(fmt.value)}
                        className={`flex-1 flex flex-col gap-2 px-4 py-4 rounded-2xl border-2 text-left transition-all duration-150 ${
                          numberFormat === fmt.value
                            ? 'border-blue-500 bg-blue-50/40 shadow-sm'
                            : 'border-gray-100 hover:border-gray-200 bg-gray-50/30'
                        }`}
                      >
                        <div className={`text-[10px] font-bold uppercase tracking-widest ${numberFormat === fmt.value ? 'text-blue-500' : 'text-gray-400'}`}>{fmt.label}</div>
                        <div className="text-sm font-semibold text-gray-900 font-mono tabular-nums">{preview}</div>
                        <div className={`h-1.5 w-1.5 rounded-full mt-1 ${numberFormat === fmt.value ? 'bg-blue-500' : 'bg-gray-200'}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-gray-100" />

              {/* ── Date et heure ── live preview + toggles dans une seule carte ── */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4">Date et heure</p>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                  {/* Live preview strip */}
                  <div className="px-5 pt-5 pb-4 border-b border-gray-100">
                    <div className="text-[10px] text-gray-400 font-medium uppercase tracking-widest mb-1.5">Aperçu</div>
                    <div className="text-xl font-semibold text-gray-900 leading-tight">{localePreview.date}</div>
                    <div className="text-sm text-gray-400 mt-1 font-mono tabular-nums">{localePreview.num}</div>
                  </div>
                  {/* Toggles */}
                  <div className="px-5 py-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{t('settings.language.mondayFirst')}</div>
                        <div className="text-xs text-gray-400 mt-0.5">La semaine commence le lundi dans le calendrier</div>
                      </div>
                      <Switch checked={mondayFirst} onChange={setMondayFirst} />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{t('settings.language.time24h')}</div>
                        <div className="text-xs text-gray-400 mt-0.5">Affiche 14h30 au lieu de 2:30 PM</div>
                      </div>
                      <Switch checked={time24h} onChange={setTime24h} />
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {active === 'notifications' && (
            <div className="space-y-6">

              {/* ── Master toggle ── */}
              <div className={`flex items-center justify-between px-5 py-4 rounded-2xl border-2 transition-all duration-150 ${notifEnabled ? 'border-blue-500 bg-blue-50/30' : 'border-gray-100 bg-gray-50/40'}`}>
                <div className="flex items-center gap-4">
                  <div className={`flex items-center justify-center h-10 w-10 rounded-xl transition-colors ${notifEnabled ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                    {notifEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className={`text-sm font-semibold ${notifEnabled ? 'text-blue-800' : 'text-gray-700'}`}>{t('settings.notifications.toggleLabel')}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{t('settings.notifications.toggleDescription')}</div>
                  </div>
                </div>
                <Switch checked={notifEnabled} onChange={setNotifEnabled} />
              </div>

              {/* ── Canaux ── */}
              <div className={`space-y-3 transition-opacity duration-200 ${notifEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('settings.notifications.channels.title')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { key: 'app',   checked: notifApp,   onChange: setNotifApp,   Icon: MonitorSmartphone, label: t('settings.notifications.channels.app'),   sub: 'Dans l\'interface' },
                    { key: 'email', checked: notifEmail, onChange: setNotifEmail, Icon: Mail,               label: t('settings.notifications.channels.email'), sub: 'Par e-mail' },
                    { key: 'sms',   checked: notifSMS,   onChange: setNotifSMS,   Icon: MessageSquare,      label: t('settings.notifications.channels.sms'),   sub: 'Par SMS' },
                  ] as const).map((ch) => (
                    <label
                      key={ch.key}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 cursor-pointer transition-all duration-150 ${ch.checked ? 'border-blue-500 bg-blue-50/30' : 'border-gray-100 bg-gray-50/30 hover:border-gray-200'}`}
                    >
                      <div className={`flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0 transition-colors ${ch.checked ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        <ch.Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium leading-tight ${ch.checked ? 'text-blue-800' : 'text-gray-700'}`}>{ch.label}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{ch.sub}</div>
                      </div>
                      <Switch checked={ch.checked} onChange={ch.onChange} />
                    </label>
                  ))}
                </div>
              </div>

              {/* ── Plage silencieuse ── */}
              <div className={`transition-opacity duration-200 ${notifEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">{t('settings.notifications.quiet.title')}</p>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                  <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
                    <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-indigo-100 text-indigo-500 flex-shrink-0">
                      <Moon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{t('settings.notifications.quiet.description')}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{t('settings.notifications.quiet.range', { start: quietStart, end: quietEnd })}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-px bg-gray-100">
                    <div className="px-5 py-4 bg-gray-50/60">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('settings.notifications.quiet.start')}</label>
                      <input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" />
                    </div>
                    <div className="px-5 py-4 bg-gray-50/60">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('settings.notifications.quiet.end')}</label>
                      <input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Notification de test ── */}
              <div className={`transition-opacity duration-200 ${notifEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">{t('settings.notifications.demo.title')}</p>
                <div className="flex items-center justify-between px-5 py-4 rounded-2xl border border-gray-100 bg-gray-50/60">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{t('settings.notifications.demo.description')}</div>
                    {(!notifEnabled || !notifApp) && (
                      <div className="text-xs text-gray-400 mt-0.5">{t('settings.notifications.demo.disabledHint')}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSendDemoNotification}
                    disabled={sendingDemoNotification || !notifEnabled || !notifApp}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 ml-4"
                  >
                    <BellRing className="h-4 w-4" />
                    {sendingDemoNotification ? t('settings.notifications.demo.sending') : t('settings.notifications.demo.button')}
                  </button>
                </div>
              </div>

            </div>
          )}

          {active === 'navigation' && (
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">

              {/* ── Menu actif (drag & drop) ── */}
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('settings.navigation.title')}</p>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                  <div className="p-3 space-y-1.5 min-h-[200px]"
                    onDragOver={allowDrop}
                    onDrop={effectiveMenuLayout.length === 0 ? handleDropAtStart : undefined}
                  >
                    {effectiveMenuLayout.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-32 rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
                        {t('settings.navigation.empty')}
                      </div>
                    ) : (
                      <>
                        <div
                          className={`h-2 rounded-lg border border-dashed transition-colors ${draggedMenuId ? 'border-blue-300 bg-blue-100/40' : 'border-transparent'}`}
                          onDragOver={allowDrop}
                          onDrop={handleDropAtStart}
                        />
                        {effectiveMenuLayout.map((node) => renderMenuNode(node))}
                        <div
                          className={`h-2 rounded-lg border border-dashed transition-colors ${draggedMenuId ? 'border-blue-300 bg-blue-100/40' : 'border-transparent'}`}
                          onDragOver={allowDrop}
                          onDrop={handleDropAtEnd}
                        />
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddGroup}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" /> {t('settings.navigation.addGroup')}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetMenu}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                  >
                    {t('settings.navigation.reset')}
                  </button>
                </div>
              </div>

              {/* ── Éléments disponibles ── */}
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{t('settings.navigation.available.title')}</p>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                  {availableNavItems.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-gray-400">
                      {t('settings.navigation.available.allAdded')}
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {availableNavItems.map((def) => (
                        <li key={def.key} className="flex items-center gap-3 px-4 py-3">
                          <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-gray-100 flex-shrink-0">
                            <def.icon className="h-3.5 w-3.5 text-gray-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">{def.name}</div>
                            <div className="text-[11px] text-gray-400">{def.href}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAddMenuItem(def.key)}
                            className="h-6 w-6 flex items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors flex-shrink-0"
                            title={t('settings.navigation.available.add')}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

            </div>
          )}

          {active === 'security' && (
            <div className="space-y-6">

              {/* ── Mot de passe ── */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">{t('settings.security.password.title')}</p>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                  <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
                    <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-violet-100 text-violet-500 flex-shrink-0">
                      <KeyRound className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{t('settings.security.password.description')}</div>
                    </div>
                  </div>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!user?.id) return;
                      if (newPwd.length < 8) { toast.error(t('settings.security.password.errors.tooShort')); return; }
                      if (newPwd !== confirmPwd) { toast.error(t('settings.security.password.errors.mismatch')); return; }
                      if (currPwd === newPwd) { toast.error(t('settings.security.password.errors.sameAsCurrent')); return; }
                      try {
                        setChangingPwd(true);
                        const { data, error } = await supabase.rpc('change_password', { p_user_id: user.id, p_old_password: currPwd, p_new_password: newPwd });
                        if (error) throw error;
                        if (!data) { toast.error(t('settings.security.password.errors.invalidCurrent')); return; }
                        setCurrPwd(''); setNewPwd(''); setConfirmPwd('');
                        toast.success(t('settings.security.password.success'));
                      } catch (err) {
                        console.error(err);
                        toast.error(t('settings.security.password.genericError'));
                      } finally {
                        setChangingPwd(false);
                      }
                    }}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-gray-100">
                      <div className="px-5 py-4 bg-gray-50/60">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('settings.security.password.current')}</label>
                        <input type="password" value={currPwd} onChange={(e) => setCurrPwd(e.target.value)} placeholder="••••••••" className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" required />
                      </div>
                      <div className="px-5 py-4 bg-gray-50/60">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('settings.security.password.new')}</label>
                        <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="••••••••" className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" required />
                      </div>
                      <div className="px-5 py-4 bg-gray-50/60">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{t('settings.security.password.confirm')}</label>
                        <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="••••••••" className="block w-full border-0 border-b border-gray-200 bg-transparent px-0 py-2 text-sm text-gray-900 focus:outline-none focus:ring-0 focus:border-blue-400 transition-colors rounded-none" required />
                      </div>
                    </div>
                    <div className="px-5 py-4 flex justify-end">
                      <button type="submit" disabled={changingPwd} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        <KeyRound className="h-3.5 w-3.5" />
                        {changingPwd ? '…' : t('settings.security.password.save')}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* ── Double authentification ── */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">{t('settings.security.email2fa.title')}</p>
                <div className="space-y-3">

                  {/* Email 2FA */}
                  <div className={`rounded-2xl border-2 transition-all duration-150 overflow-hidden ${twoFA ? 'border-blue-500 bg-blue-50/30' : 'border-gray-100 bg-gray-50/30'}`}>
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className={`flex items-center justify-center h-10 w-10 rounded-xl flex-shrink-0 transition-colors ${twoFA ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        <Mail className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold ${twoFA ? 'text-blue-800' : 'text-gray-700'}`}>{t('settings.security.email2fa.emailLabel')}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{t('settings.security.email2fa.emailDescription', { email: user?.email || '—' })}</div>
                        {twoFactorEnabledAtDisplay && twoFA && (
                          <div className="text-[11px] text-blue-400 mt-1">{t('settings.security.activatedAt', { date: twoFactorEnabledAtDisplay })}</div>
                        )}
                      </div>
                      <Switch checked={twoFA} onChange={handleToggleTwoFactor} disabled={twoFactorLoading} label={t('settings.security.email2fa.title')} />
                    </div>
                    <div className={`mx-5 mb-4 rounded-xl px-4 py-3 text-xs leading-5 transition-colors ${twoFA ? 'bg-blue-100/60 text-blue-800' : 'bg-gray-100/60 text-gray-500'}`}>
                      {twoFA ? t('settings.security.email2fa.emailActive') : t('settings.security.email2fa.emailInactive')}
                    </div>
                    {twoFactorLoading && <p className="px-5 pb-3 text-xs text-gray-400">{t('settings.security.updating')}</p>}
                  </div>

                  {/* TOTP */}
                  <div className={`rounded-2xl border-2 transition-all duration-150 overflow-hidden ${totpEnabled || totpSetupInProgress ? 'border-emerald-500 bg-emerald-50/30' : 'border-gray-100 bg-gray-50/30'}`}>
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className={`flex items-center justify-center h-10 w-10 rounded-xl flex-shrink-0 transition-colors ${totpEnabled || totpSetupInProgress ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                        <Smartphone className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-semibold ${totpEnabled || totpSetupInProgress ? 'text-emerald-800' : 'text-gray-700'}`}>{t('settings.security.totpLabel')}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{t('settings.security.totpDescription')}</div>
                        {totpEnabledAtDisplay && totpEnabled && (
                          <div className="text-[11px] text-emerald-500 mt-1">{t('settings.security.activatedAt', { date: totpEnabledAtDisplay })}</div>
                        )}
                      </div>
                      <Switch checked={totpEnabled || totpSetupInProgress} onChange={handleToggleTotp} disabled={totpLoading} label={t('settings.security.totpLabel')} />
                    </div>

                    {totpSetupInProgress ? (
                      <div className="mx-5 mb-4 rounded-xl bg-emerald-50/60 border border-emerald-100 p-4">
                        <div className="grid gap-5 md:grid-cols-2">
                          <div className="flex flex-col items-center gap-3">
                            {totpSetupQr ? (
                              <img src={totpSetupQr} alt={t('settings.security.totpSetup.qrAlt')} className="h-44 w-44 rounded-xl border border-emerald-200 bg-white p-2 shadow-sm" />
                            ) : (
                              <div className="h-44 w-44 rounded-xl border border-dashed border-emerald-300 bg-white flex items-center justify-center">
                                <QrCode className="h-10 w-10 text-emerald-300" />
                              </div>
                            )}
                            <p className="text-[11px] text-emerald-800/70 text-center leading-4">{t('settings.security.totpSetup.instructions')}</p>
                            <div className="w-full rounded-lg border border-dashed border-emerald-300 bg-white/70 px-3 py-2 text-center text-xs font-mono text-emerald-900 tracking-widest">{totpSetupSecret}</div>
                          </div>
                          <div className="flex flex-col gap-3 justify-center">
                            <label className="text-xs font-semibold text-emerald-800 uppercase tracking-widest">{t('settings.security.totpSetup.codeLabel')}</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={totpSetupCode}
                              onChange={(event) => { const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 6); setTotpSetupCode(digits); }}
                              className="block w-full border-0 border-b border-emerald-300 bg-transparent px-0 py-2 text-lg text-emerald-900 font-mono tracking-[0.4em] text-center focus:outline-none focus:ring-0 focus:border-emerald-500 transition-colors rounded-none placeholder-emerald-300"
                              placeholder="000000"
                            />
                            <div className="flex gap-2 pt-1">
                              <button type="button" onClick={handleConfirmTotpSetup} disabled={totpLoading} className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                                {totpLoading ? t('settings.security.totpSetup.validating') : t('settings.security.totpSetup.validate')}
                              </button>
                              <button type="button" onClick={handleCancelTotpSetup} disabled={totpLoading} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                                {t('settings.security.totpSetup.cancel')}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`mx-5 mb-4 rounded-xl px-4 py-3 text-xs leading-5 transition-colors ${totpEnabled ? 'bg-emerald-100/60 text-emerald-800' : 'bg-gray-100/60 text-gray-500'}`}>
                        {totpEnabled ? t('settings.security.totpActive') : t('settings.security.totpInactive')}
                      </div>
                    )}
                    {totpInfo && <p className="px-5 pb-3 text-xs text-blue-600">{totpInfo}</p>}
                    {totpError && <p className="px-5 pb-3 text-xs text-rose-500">{totpError}</p>}
                  </div>
                </div>
              </div>

              {/* ── Historique des connexions ── */}
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">{t('settings.security.sessions.title')}</p>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/60 overflow-hidden">
                  {sessionLoading ? (
                    <div className="px-5 py-8 text-center text-xs text-gray-400">{t('settings.security.sessions.loading')}</div>
                  ) : sessionLogs.length === 0 ? (
                    <div className="px-5 py-8 text-center text-xs text-gray-400">{t('settings.security.sessions.empty')}</div>
                  ) : (
                    <ul className="divide-y divide-gray-100">
                      {sessionLogs.map((entry) => {
                        const created = new Date(entry.created_at);
                        const formatted = sessionDateFormatter.format(created);
                        const methodLabel = entry.method === 'email_2fa'
                          ? t('login.twoFactor.method.email')
                          : entry.method === 'totp'
                            ? t('login.twoFactor.method.totp')
                            : entry.method === 'password'
                              ? t('settings.security.sessions.method.password')
                              : entry.method || '—';
                        return (
                          <li key={entry.id} className="flex items-center gap-4 px-5 py-3.5">
                            <div className={`flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0 ${entry.success ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-500'}`}>
                              <LogIn className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${entry.success ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>{methodLabel}</span>
                                {entry.location && (
                                  <span className="flex items-center gap-0.5 text-[11px] text-gray-400"><MapPin className="h-2.5 w-2.5" />{entry.location}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-[11px] text-gray-400">{t('settings.security.sessions.ip', { ip: entry.ip_address ?? '—' })}</span>
                                {entry.user_agent && <span className="text-[11px] text-gray-300 truncate max-w-[200px]">{entry.user_agent}</span>}
                              </div>
                            </div>
                            <span className="text-[11px] text-gray-400 flex-shrink-0">{formatted}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

            </div>
          )}

          </div>
        </div>
        )}

      </div>
    </div>
  );
};

export default SettingsPage;
