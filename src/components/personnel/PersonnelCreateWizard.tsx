import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Mail,
  Phone,
  Shield,
  UserRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Field, Input, ProgressBar, Select, StepTransition, Textarea } from '../ui-kit';
import { cn } from '../../utils/cn';

type StepId = 'identity' | 'hr' | 'access' | 'summary';

interface PersonnelCreateWizardProps {
  onCancel: () => void;
  onCreated?: (payload: { id: string; hasAppUser: boolean }) => Promise<void> | void;
}

const steps: Array<{ id: StepId; label: string; description: string }> = [
  { id: 'identity', label: 'Informations generales', description: 'Base crew et contact' },
  { id: 'hr', label: 'Cadre RH', description: 'Contrat et remuneration' },
  { id: 'access', label: 'Acces application', description: 'Compte utilisateur optionnel' },
  { id: 'summary', label: 'Validation', description: 'Controle avant creation' },
];

const roleOptions = [
  { value: 'manager', label: 'Manager' },
  { value: 'technician', label: 'Technicien' },
  { value: 'driver', label: 'Chauffeur' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'accountant', label: 'Comptable' },
  { value: 'admin', label: 'Administrateur' },
] as const;

const statusOptions = [
  { value: 'active', label: 'Actif' },
  { value: 'inactive', label: 'Inactif' },
  { value: 'vacation', label: 'Conges' },
  { value: 'sick_leave', label: 'Arret maladie' },
] as const;

const employmentTypeOptions = [
  { value: 'employee', label: 'Salarie' },
  { value: 'intermittent', label: 'Intermittent' },
  { value: 'auto_entrepreneur', label: 'Auto-entrepreneur' },
  { value: 'intern', label: 'Stagiaire' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'subcontractor', label: 'Sous-traitant' },
] as const;

const paymentModelOptions = [
  { value: 'salary', label: 'Salaire' },
  { value: 'hourly', label: 'Horaire' },
  { value: 'daily', label: 'Forfait jour' },
  { value: 'cachet', label: 'Cachet' },
  { value: 'mixed', label: 'Mixte' },
] as const;

const cardClass = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';

const parseMoney = (value: string) => {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const formatMoney = (value: string) => {
  const parsed = parseMoney(value);
  if (parsed == null) return '—';
  return `${parsed.toLocaleString('fr-FR')} €`;
};

const SummaryItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-1 text-sm text-slate-700">{value}</div>
  </div>
);

const PersonnelCreateWizard: React.FC<PersonnelCreateWizardProps> = ({ onCancel, onCreated }) => {
  const [step, setStep] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [address, setAddress] = useState('');

  const [role, setRole] = useState('manager');
  const [status, setStatus] = useState('active');
  const [hireDate, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [employmentType, setEmploymentType] = useState('employee');
  const [paymentModel, setPaymentModel] = useState('salary');
  const [salary, setSalary] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [dayRate, setDayRate] = useState('');
  const [cachetRate, setCachetRate] = useState('');
  const [payrollNotes, setPayrollNotes] = useState('');

  const [createAppUser, setCreateAppUser] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');

  const currentStep = steps[step];
  const progress = ((step + 1) / steps.length) * 100;
  const fullName = `${firstName} ${lastName}`.trim();
  const roleLabel = roleOptions.find((option) => option.value === role)?.label || role;
  const statusLabel = statusOptions.find((option) => option.value === status)?.label || status;
  const employmentTypeLabel = employmentTypeOptions.find((option) => option.value === employmentType)?.label || employmentType;
  const paymentModelLabel = paymentModelOptions.find((option) => option.value === paymentModel)?.label || paymentModel;

  const showSalary = paymentModel === 'salary';
  const showHourly = paymentModel === 'hourly' || paymentModel === 'mixed';
  const showDay = paymentModel === 'daily' || paymentModel === 'mixed';
  const showCachet = paymentModel === 'cachet' || paymentModel === 'mixed';

  const chosenRates = useMemo(() => {
    const items = [] as string[];
    if (showSalary && salary.trim()) items.push(`Salaire ${formatMoney(salary)}`);
    if (showHourly && hourlyRate.trim()) items.push(`Horaire ${formatMoney(hourlyRate)}`);
    if (showDay && dayRate.trim()) items.push(`Jour ${formatMoney(dayRate)}`);
    if (showCachet && cachetRate.trim()) items.push(`Cachet ${formatMoney(cachetRate)}`);
    return items;
  }, [cachetRate, dayRate, hourlyRate, salary, showCachet, showDay, showHourly, showSalary]);

  const validateRates = () => {
    const candidates = [
      { value: salary, active: showSalary, label: 'salaire' },
      { value: hourlyRate, active: showHourly, label: 'taux horaire' },
      { value: dayRate, active: showDay, label: 'taux journalier' },
      { value: cachetRate, active: showCachet, label: 'cachet' },
    ];

    for (const candidate of candidates) {
      if (!candidate.active || !candidate.value.trim()) continue;
      const parsed = parseMoney(candidate.value);
      if (parsed == null || parsed < 0) {
        toast.error(`Le champ ${candidate.label} doit contenir un montant valide`);
        return false;
      }
    }

    return true;
  };

  const validateCurrentStep = () => {
    const stepId = currentStep.id;

    if (stepId === 'identity') {
      if (!firstName.trim() || !lastName.trim()) {
        toast.error('Le prenom et le nom sont requis');
        return false;
      }
      if (contactEmail.trim() && !isValidEmail(contactEmail)) {
        toast.error('L email de contact est invalide');
        return false;
      }
    }

    if (stepId === 'hr') {
      if (!validateRates()) return false;
    }

    if (stepId === 'access' && createAppUser) {
      if (!loginEmail.trim()) {
        toast.error('Un email de connexion est requis');
        return false;
      }
      if (!isValidEmail(loginEmail)) {
        toast.error('L email de connexion est invalide');
        return false;
      }
    }

    return true;
  };

  const goToNext = () => {
    if (!validateCurrentStep()) return;
    setTransitionDirection('forward');
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const goToPrevious = () => {
    setTransitionDirection('backward');
    setStep((current) => Math.max(current - 1, 0));
  };

  const submit = async () => {
    if (!validateCurrentStep() || !validateRates()) return;

    setSaving(true);
    try {
      const response = await fetch('/api/personnel/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          contactEmail: contactEmail.trim() || null,
          phone: phone.trim() || null,
          jobTitle: jobTitle.trim() || null,
          address: address.trim() || null,
          role,
          status,
          hireDate: hireDate || null,
          employmentType,
          paymentModel,
          salary: showSalary ? parseMoney(salary) : null,
          hourlyRate: showHourly ? parseMoney(hourlyRate) : null,
          dayRate: showDay ? parseMoney(dayRate) : null,
          cachetRate: showCachet ? parseMoney(cachetRate) : null,
          payrollNotes: payrollNotes.trim() || null,
          createAppUser,
          loginEmail: createAppUser ? loginEmail.trim().toLowerCase() : null,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Impossible de creer le crew');
      }

      toast.success(createAppUser ? 'Crew et compte utilisateur crees' : 'Crew cree');
      await onCreated?.({ id: payload?.personnel_id, hasAppUser: Boolean(payload?.has_app_user) });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Erreur de creation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 pt-5">
        <ProgressBar value={progress} className="h-2 bg-gray-200" indicatorClassName="bg-blue-600" />
        <div className="mt-2 text-sm text-gray-600">
          Etape {step + 1} sur {steps.length} · {currentStep.label}
        </div>
      </div>

      <div className="p-6">
        <StepTransition stepKey={step} direction={transitionDirection} className="space-y-6">
          {currentStep.id === 'identity' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 space-y-6">
                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Informations du crew</div>
                    <div className="text-xs text-gray-500">Base de la fiche qui sera visible dans l equipe et le planning.</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Prenom" id="crew-first-name">
                      <Input
                        id="crew-first-name"
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        placeholder="Camille"
                      />
                    </Field>
                    <Field label="Nom" id="crew-last-name">
                      <Input
                        id="crew-last-name"
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        placeholder="Dupont"
                      />
                    </Field>
                    <Field
                      label="Email de contact"
                      id="crew-contact-email"
                      helper="Optionnel. Peut etre different de l email de connexion."
                    >
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="crew-contact-email"
                          type="email"
                          value={contactEmail}
                          onChange={(event) => setContactEmail(event.target.value)}
                          className="pl-9"
                          placeholder="camille@exemple.com"
                        />
                      </div>
                    </Field>
                    <Field label="Telephone" id="crew-phone">
                      <div className="relative">
                        <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="crew-phone"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          className="pl-9"
                          placeholder="06 00 00 00 00"
                        />
                      </div>
                    </Field>
                  </div>
                </div>

                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Positionnement interne</div>
                    <div className="text-xs text-gray-500">Informations utiles pour identifier rapidement la fiche dans l app.</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Poste / fonction" id="crew-job-title">
                      <div className="relative">
                        <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="crew-job-title"
                          value={jobTitle}
                          onChange={(event) => setJobTitle(event.target.value)}
                          className="pl-9"
                          placeholder="Technicien son, regisseur, chauffeur..."
                        />
                      </div>
                    </Field>
                    <Field label="Date d entree" id="crew-hire-date">
                      <div className="relative">
                        <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="crew-hire-date"
                          type="date"
                          value={hireDate}
                          onChange={(event) => setHireDate(event.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </Field>
                    <Field label="Adresse" id="crew-address" className="md:col-span-2">
                      <Textarea
                        id="crew-address"
                        value={address}
                        onChange={(event) => setAddress(event.target.value)}
                        rows={4}
                        placeholder="Adresse postale ou point de rattachement"
                      />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 flex h-full flex-col">
                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Resume de la fiche</div>
                    <div className="text-xs text-gray-500">Controle rapide avant de passer au cadre RH.</div>
                  </div>
                  <div className="space-y-4">
                    <SummaryItem label="Crew" value={fullName || 'Nom non renseigne'} />
                    <SummaryItem label="Contact" value={contactEmail || phone || 'Aucun contact renseigne'} />
                    <SummaryItem label="Poste" value={jobTitle || 'A definir'} />
                    <SummaryItem label="Date d entree" value={hireDate || 'Non renseignee'} />
                  </div>
                </div>
                <div className={`mt-4 ${cardClass} space-y-3`}>
                  <div className="text-sm font-medium text-gray-900">Principe de creation</div>
                  <p className="text-sm text-gray-500">
                    Le crew est la fiche principale. Le compte utilisateur est optionnel et sera traite a l etape suivante.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'hr' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 space-y-6">
                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Cadre RH</div>
                    <div className="text-xs text-gray-500">Statut principal et positionnement RH de la fiche crew.</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Role interne" id="crew-role">
                      <Select id="crew-role" value={role} onChange={(event) => setRole(event.target.value)}>
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Statut" id="crew-status">
                      <Select id="crew-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Type d emploi" id="crew-employment-type">
                      <Select
                        id="crew-employment-type"
                        value={employmentType}
                        onChange={(event) => setEmploymentType(event.target.value)}
                      >
                        {employmentTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Mode de remuneration" id="crew-payment-model">
                      <Select
                        id="crew-payment-model"
                        value={paymentModel}
                        onChange={(event) => setPaymentModel(event.target.value)}
                      >
                        {paymentModelOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </div>

                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Base de remuneration</div>
                    <div className="text-xs text-gray-500">Reference de cout utilisee pour la creation de la fiche.</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {showSalary && (
                      <Field label="Salaire annuel brut" id="crew-salary">
                        <div className="relative">
                          <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            id="crew-salary"
                            value={salary}
                            onChange={(event) => setSalary(event.target.value)}
                            className="pl-9"
                            placeholder="42000"
                          />
                        </div>
                      </Field>
                    )}
                    {showHourly && (
                      <Field label="Taux horaire" id="crew-hourly-rate">
                        <Input
                          id="crew-hourly-rate"
                          value={hourlyRate}
                          onChange={(event) => setHourlyRate(event.target.value)}
                          placeholder="25"
                        />
                      </Field>
                    )}
                    {showDay && (
                      <Field label="Taux journalier" id="crew-day-rate">
                        <Input
                          id="crew-day-rate"
                          value={dayRate}
                          onChange={(event) => setDayRate(event.target.value)}
                          placeholder="250"
                        />
                      </Field>
                    )}
                    {showCachet && (
                      <Field label="Cachet" id="crew-cachet-rate">
                        <Input
                          id="crew-cachet-rate"
                          value={cachetRate}
                          onChange={(event) => setCachetRate(event.target.value)}
                          placeholder="300"
                        />
                      </Field>
                    )}
                    <Field label="Notes RH" id="crew-payroll-notes" className="md:col-span-2">
                      <Textarea
                        id="crew-payroll-notes"
                        value={payrollNotes}
                        onChange={(event) => setPayrollNotes(event.target.value)}
                        rows={4}
                        placeholder="Informations RH ou paie utiles pour le suivi interne"
                      />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 flex h-full flex-col">
                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Resume RH</div>
                    <div className="text-xs text-gray-500">Lecture rapide du cadre retenu pour cette creation.</div>
                  </div>
                  <div className="space-y-4">
                    <SummaryItem label="Role" value={roleLabel} />
                    <SummaryItem label="Statut" value={statusLabel} />
                    <SummaryItem label="Type d emploi" value={employmentTypeLabel} />
                    <SummaryItem label="Remuneration" value={chosenRates.length > 0 ? chosenRates.join(' · ') : 'A completer'} />
                  </div>
                </div>
                <div className={`mt-4 ${cardClass} space-y-3`}>
                  <div className="text-sm font-medium text-gray-900">Mode retenu</div>
                  <p className="text-sm text-gray-500">
                    Le mode de remuneration actuel est <span className="font-medium text-gray-700">{paymentModelLabel.toLowerCase()}</span>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'access' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 space-y-6">
                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Type de creation</div>
                    <div className="text-xs text-gray-500">Le compte utilisateur reste optionnel. La fiche crew, elle, sera toujours creee.</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setCreateAppUser(false)}
                      className={cn(
                        'rounded-lg border px-4 py-4 text-left transition',
                        !createAppUser
                          ? 'border-blue-200 bg-blue-50 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            'inline-flex h-9 w-9 items-center justify-center rounded-lg',
                            !createAppUser ? 'bg-white text-blue-600 shadow-sm' : 'bg-slate-100 text-slate-500'
                          )}
                        >
                          <UserRound className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="text-sm font-medium">Crew sans compte</div>
                          <div className="mt-1 text-xs opacity-80">Fiche crew seule, sans identifiants applicatifs.</div>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateAppUser(true);
                        if (!loginEmail.trim() && contactEmail.trim()) {
                          setLoginEmail(contactEmail.trim());
                        }
                      }}
                      className={cn(
                        'rounded-lg border px-4 py-4 text-left transition',
                        createAppUser
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            'inline-flex h-9 w-9 items-center justify-center rounded-lg',
                            createAppUser ? 'bg-white text-emerald-600 shadow-sm' : 'bg-slate-100 text-slate-500'
                          )}
                        >
                          <Shield className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="text-sm font-medium">Crew avec acces app</div>
                          <div className="mt-1 text-xs opacity-80">Creation de la fiche crew et du compte utilisateur en une seule action.</div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Compte utilisateur</div>
                    <div className="text-xs text-gray-500">Un utilisateur ne peut pas exister seul: il est toujours rattache a cette fiche crew.</div>
                  </div>
                  {createAppUser ? (
                    <div className="space-y-4">
                      <Field
                        label="Email de connexion"
                        id="crew-login-email"
                        helper="Cet email recevra le mot de passe temporaire a la creation."
                      >
                        <div className="relative">
                          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <Input
                            id="crew-login-email"
                            type="email"
                            value={loginEmail}
                            onChange={(event) => setLoginEmail(event.target.value)}
                            className="pl-9"
                            placeholder="connexion@exemple.com"
                          />
                        </div>
                      </Field>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                        Le compte utilisateur sera cree en meme temps que la fiche crew.
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      Aucun acces application ne sera cree a cette etape. Vous pourrez l ajouter plus tard depuis le detail du crew.
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-2 flex h-full flex-col">
                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Resume acces</div>
                    <div className="text-xs text-gray-500">Validation de la separation entre fiche crew et compte utilisateur.</div>
                  </div>
                  <div className="space-y-4">
                    <SummaryItem label="Mode" value={createAppUser ? 'Crew avec compte utilisateur' : 'Crew sans compte'} />
                    <SummaryItem label="Email de connexion" value={createAppUser ? loginEmail || 'A renseigner' : 'Aucun'} />
                  </div>
                </div>
                <div className={`mt-4 ${cardClass} space-y-3`}>
                  <div className="text-sm font-medium text-gray-900">Rappel</div>
                  <p className="text-sm text-gray-500">
                    La creation d un utilisateur passe obligatoirement par la creation d une fiche crew.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep.id === 'summary' && (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 space-y-6">
                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Fiche crew</div>
                    <div className="text-xs text-gray-500">Resume general de la fiche qui va etre creee.</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SummaryItem label="Nom" value={fullName || '—'} />
                    <SummaryItem label="Poste" value={jobTitle || '—'} />
                    <SummaryItem label="Email de contact" value={contactEmail || '—'} />
                    <SummaryItem label="Telephone" value={phone || '—'} />
                    <SummaryItem label="Date d entree" value={hireDate || '—'} />
                    <SummaryItem label="Adresse" value={address || '—'} />
                  </div>
                </div>

                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Cadre RH</div>
                    <div className="text-xs text-gray-500">Role, statut et reference de cout associes a cette creation.</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SummaryItem label="Role" value={roleLabel} />
                    <SummaryItem label="Statut" value={statusLabel} />
                    <SummaryItem label="Type d emploi" value={employmentTypeLabel} />
                    <SummaryItem label="Mode de remuneration" value={paymentModelLabel} />
                    <SummaryItem
                      label="Base de remuneration"
                      value={chosenRates.length > 0 ? chosenRates.join(' · ') : 'Aucune valeur saisie'}
                    />
                    <SummaryItem label="Notes RH" value={payrollNotes || '—'} />
                  </div>
                </div>

                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Acces application</div>
                    <div className="text-xs text-gray-500">Etat final de la creation du compte utilisateur.</div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <SummaryItem label="Type de creation" value={createAppUser ? 'Crew avec compte' : 'Crew sans compte'} />
                    <SummaryItem label="Email de connexion" value={createAppUser ? loginEmail || 'A renseigner' : 'Aucun'} />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2 flex h-full flex-col">
                <div className={`${cardClass} space-y-4`}>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Controle final</div>
                    <div className="text-xs text-gray-500">Derniere verification avant de lancer la creation.</div>
                  </div>
                  <div
                    className={cn(
                      'rounded-lg border px-4 py-4 text-sm',
                      createAppUser
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    )}
                  >
                    <div className="font-medium">
                      {createAppUser ? 'Creation d une fiche crew et d un compte utilisateur' : 'Creation d une fiche crew sans acces application'}
                    </div>
                    <p className="mt-1">
                      {createAppUser
                        ? 'Un mot de passe temporaire sera envoye a l email de connexion.'
                        : 'La fiche sera creee seule et pourra recevoir un compte plus tard.'}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <SummaryItem label="Crew" value={fullName || 'A completer'} />
                    <SummaryItem label="Cadre RH" value={`${employmentTypeLabel} · ${paymentModelLabel}`} />
                    <SummaryItem label="Etat acces" value={createAppUser ? 'Compte cree' : 'Aucun compte'} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </StepTransition>
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
        <div>
          {step > 0 ? (
            <Button type="button" variant="secondary" onClick={goToPrevious} disabled={saving}>
              <ChevronLeft className="h-4 w-4" />
              Etape precedente
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
              Annuler
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {step < steps.length - 1 ? (
            <Button type="button" onClick={goToNext} disabled={saving}>
              Etape suivante
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={() => void submit()} loading={saving}>
              {createAppUser ? 'Creer le crew et le compte' : 'Creer le crew'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonnelCreateWizard;
