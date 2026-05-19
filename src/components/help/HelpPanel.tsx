import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';

// ── Help content per route ────────────────────────────────────────────────────

interface HelpChapter {
  title: string;
  body: string | React.ReactNode;
}

interface HelpPage {
  title: string;
  chapters: HelpChapter[];
}

const HELP_CONTENT: Record<string, HelpPage> = {
  '/maintenance/': {
    title: 'Détail d\'une maintenance',
    chapters: [
      {
        title: 'Présentation',
        body: 'La fiche maintenance regroupe toutes les informations d\'une intervention : statut, priorité, coût, dates, notes, et documents associés. Elle est liée à un équipement spécifique et peut être créée depuis la liste des maintenances ou directement depuis la fiche équipement.',
      },
      {
        title: 'Informations générales',
        body: 'Modifiez le titre, le type d\'intervention (préventive, corrective, inspection), le statut, la priorité, les dates de début et de fin prévues, le coût estimé et les notes internes. Toutes les modifications sont sauvegardées en cliquant sur Enregistrer.',
      },
      {
        title: 'Statuts & priorités',
        body: (
          <div className="space-y-3">
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Statuts :</p>
              <ul className="space-y-1">
                {[['En attente','Intervention planifiée, pas encore commencée.'],['En cours','Intervention démarrée.'],['Terminée','Intervention clôturée.'],['Annulée','Intervention annulée.']].map(([n,d])=>(
                  <li key={n} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400"><span className="text-gray-300 flex-shrink-0">–</span><span><span className="font-medium text-gray-700 dark:text-gray-300">{n}</span> : {d}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Priorités :</p>
              <ul className="space-y-1">
                {[['Basse','Intervention non urgente, peut être planifiée librement.'],['Moyenne','À traiter dans les prochains jours.'],['Haute','À traiter rapidement.'],['Urgente','Intervention immédiate requise.']].map(([n,d])=>(
                  <li key={n} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400"><span className="text-gray-300 flex-shrink-0">–</span><span><span className="font-medium text-gray-700 dark:text-gray-300">{n}</span> : {d}</span></li>
                ))}
              </ul>
            </div>
          </div>
        ),
      },
      {
        title: 'Documents',
        body: 'L\'onglet Documents permet d\'attacher des fichiers à la fiche maintenance : rapports d\'intervention, factures prestataires, photos ou tout autre document. Chaque fichier est classé par type (rapport, facture, upload, autre) et affiché avec sa date de dépôt.',
      },
      {
        title: 'Clôturer une maintenance',
        body: 'Le bouton Terminer passe la maintenance au statut Terminée et libère l\'équipement associé si celui-ci était bloqué pour cause de maintenance. L\'action est irréversible depuis l\'interface (hors modification manuelle du statut).',
      },
    ],
  },

  '/maintenance': {
    title: 'Maintenance',
    chapters: [
      {
        title: 'Présentation',
        body: 'La liste des maintenances regroupe toutes les interventions planifiées ou en cours sur votre parc d\'équipements. Chaque ligne affiche le titre, l\'équipement concerné, le type, le statut, la priorité et le coût estimé.',
      },
      {
        title: 'Types d\'intervention',
        body: (
          <ul className="space-y-1.5">
            {[['Préventive','Entretien régulier programmé pour prévenir les pannes.'],['Corrective','Réparation suite à une panne ou un dysfonctionnement constaté.'],['Inspection','Contrôle de conformité ou vérification technique périodique.']].map(([n,d])=>(
              <li key={n} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400"><span className="text-gray-300 flex-shrink-0">–</span><span><span className="font-medium text-gray-700 dark:text-gray-300">{n}</span> : {d}</span></li>
            ))}
          </ul>
        ),
      },
      {
        title: 'Filtres',
        body: 'Combinez plusieurs filtres simultanément : type d\'intervention, statut, priorité, et recherche textuelle (titre, nom de l\'équipement, numéro de série, notes). Sélectionnez plusieurs lignes pour effectuer des actions en lot (marquer comme terminé, supprimer).',
      },
      {
        title: 'Actions en lot',
        body: 'Cochez plusieurs lignes pour activer les actions groupées : marquer toutes les interventions sélectionnées comme terminées, ou les supprimer. Les interventions déjà terminées ou annulées sont exclues automatiquement de l\'action.',
      },
      {
        title: 'Impact sur le parc',
        body: 'Une maintenance active bloque la disponibilité de l\'équipement concerné dans le calendrier et dans les calculs de stock. L\'équipement passe au statut Maintenance tant que l\'intervention n\'est pas clôturée.',
      },
    ],
  },

  '/vehicles/': {
    title: 'Détail d\'un véhicule',
    chapters: [
      {
        title: 'Présentation',
        body: 'La fiche véhicule regroupe les informations techniques et opérationnelles d\'un véhicule de votre flotte. Elle affiche également l\'historique des livraisons auxquelles ce véhicule a participé.',
      },
      {
        title: 'Informations techniques',
        body: 'Renseignez la marque, le modèle, l\'année, la couleur, le kilométrage actuel, la capacité de charge et la plaque d\'immatriculation. Ces données sont utilisées dans les rapports logistiques et pour le suivi de flotte.',
      },
      {
        title: 'Statuts',
        body: (
          <ul className="space-y-1.5">
            {[['Actif','Véhicule disponible pour les livraisons.'],['Maintenance','Véhicule immobilisé pour entretien ou réparation.'],['Retraité','Véhicule sorti du service, conservé à titre d\'archive.']].map(([n,d])=>(
              <li key={n} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400"><span className="text-gray-300 flex-shrink-0">–</span><span><span className="font-medium text-gray-700 dark:text-gray-300">{n}</span> : {d}</span></li>
            ))}
          </ul>
        ),
      },
      {
        title: 'Historique des livraisons',
        body: 'Le bas de la fiche affiche les 50 dernières livraisons associées à ce véhicule, classées par date décroissante. Chaque entrée indique la date, le projet concerné et l\'action effectuée (livraison ou retour).',
      },
    ],
  },

  '/vehicles': {
    title: 'Véhicules',
    chapters: [
      {
        title: 'Présentation',
        body: 'La section Véhicules gère votre flotte de transport ainsi que les forfaits de livraison proposés aux clients. Elle se divise en deux onglets : la liste des véhicules et la configuration des offres de livraison.',
      },
      {
        title: 'Gestion des véhicules',
        body: 'L\'onglet Véhicules liste l\'ensemble de votre flotte. Vous pouvez créer un nouveau véhicule via le wizard de création, rechercher par nom ou plaque d\'immatriculation, et supprimer un ou plusieurs véhicules en lot.',
      },
      {
        title: 'Forfaits de livraison',
        body: 'L\'onglet Forfaits de livraison permet de configurer les tarifs proposés lors de la création d\'un projet. Chaque offre peut combiner plusieurs modes de facturation : tarif au km, à l\'heure, fixe, à la journée ou au trajet. Ces offres sont sélectionnables dans le wizard de création de projet.',
      },
      {
        title: 'Créer un véhicule',
        body: 'Le formulaire de création demande : le nom du véhicule, la plaque d\'immatriculation, la marque, le modèle, l\'année, la couleur d\'identification, la capacité de charge et le kilométrage initial. Le véhicule est immédiatement disponible pour être affecté aux livraisons.',
      },
    ],
  },

  '/accounting': {
    title: 'Comptabilité',
    chapters: [
      {
        title: 'Présentation',
        body: 'Le module comptabilité offre une vue financière de votre activité sur une période sélectionnable. Il regroupe le suivi des encaissements, la gestion des factures, les taxes et les exports de données financières.',
      },
      {
        title: 'Périodes',
        body: 'Sélectionnez une période d\'analyse via les raccourcis (mois en cours, trimestre, année, 30 derniers jours) ou définissez une plage de dates personnalisée. Toutes les données affichées se recalculent automatiquement en fonction de la période choisie.',
      },
      {
        title: 'Vue d\'ensemble',
        body: 'L\'onglet Vue d\'ensemble affiche un résumé financier : chiffre d\'affaires, montants encaissés, créances en attente, alertes sur les factures impayées ou en retard. Il donne une lecture rapide de la santé financière sur la période.',
      },
      {
        title: 'Créances',
        body: 'L\'onglet Créances liste les montants dus par les clients, avec le statut de chaque facture (en attente, partiellement payée, réglée). Filtrez par statut ou par origine (location, prestation, vente) pour cibler vos relances.',
      },
      {
        title: 'Paiements',
        body: 'L\'onglet Paiements recense tous les règlements enregistrés sur la période, avec le mode de paiement, le montant et le projet associé. Utile pour la réconciliation bancaire et le suivi des encaissements.',
      },
      {
        title: 'Taxes',
        body: 'L\'onglet Taxes calcule la TVA collectée sur la période. En mode auto-entrepreneur, la mention légale d\'exonération de TVA (art. 293B) est appliquée automatiquement sur tous les documents et les calculs excluent la TVA.',
      },
      {
        title: 'Exports',
        body: 'L\'onglet Exports permet de télécharger les données financières au format structuré pour les intégrer dans votre logiciel de comptabilité ou les transmettre à votre expert-comptable.',
      },
    ],
  },

  '/personnel/': {
    title: 'Fiche crew',
    chapters: [
      {
        title: 'Présentation',
        body: 'La fiche d\'un membre du crew regroupe son profil, ses droits d\'accès, ses données RH et ses préférences de compte. Seuls les administrateurs et managers peuvent accéder à l\'ensemble des onglets.',
      },
      {
        title: 'Informations utilisateur',
        body: 'Modifiez le nom complet, l\'e-mail, le rôle (admin, manager, technicien, chauffeur, commercial, comptable) et le statut (actif, inactif, congé, arrêt maladie). L\'e-mail sert d\'identifiant de connexion.',
      },
      {
        title: 'Permissions',
        body: 'L\'onglet Permissions affiche une grille de plus de 85 droits organisés par domaine (équipements, projets, clients, entrepôts, personnel, comptabilité, maintenance). Cochez ou décochez chaque permission individuellement. Le mode superadmin bypass tous les droits et donne un accès total.',
      },
      {
        title: 'Données RH',
        body: 'Renseignez les informations RH : salaire, date d\'embauche, compétences techniques, notes internes. Ces données sont visibles uniquement par les utilisateurs ayant le droit de gestion RH.',
      },
      {
        title: 'Compte & sécurité',
        body: 'L\'onglet Paramètres permet de forcer un changement de mot de passe à la prochaine connexion, de réinitialiser le mot de passe, et de gérer les paramètres de double authentification du compte.',
      },
    ],
  },

  '/personnel': {
    title: 'Gestion crew',
    chapters: [
      {
        title: 'Présentation',
        body: 'La section Gestion crew centralise votre équipe et les services associés. Elle se divise en deux onglets : la liste des membres de l\'équipe avec le planning Gantt, et le catalogue des services de personnel.',
      },
      {
        title: 'Liste de l\'équipe',
        body: 'L\'onglet Équipe liste tous les membres du crew avec leur rôle, statut et informations de contact. Cliquez sur un membre pour accéder à sa fiche complète. Utilisez la sélection multiple pour supprimer plusieurs membres en lot.',
      },
      {
        title: 'Planning Gantt',
        body: 'Le Gantt de personnel affiche l\'affectation de chaque membre sur les projets en cours et à venir. Chaque barre représente une période d\'affectation sur un projet. Utile pour identifier les disponibilités et éviter les surcharges.',
      },
      {
        title: 'Services de personnel',
        body: 'L\'onglet Services liste les prestations de personnel disponibles dans votre catalogue (technicien régie, chauffeur, chef de projet, etc.). Ces services sont sélectionnables lors de la création ou de l\'édition d\'un projet pour facturer les interventions humaines.',
      },
      {
        title: 'Créer un membre',
        body: 'Le wizard de création guide à travers les étapes : informations personnelles, rôle, statut, et configuration du compte d\'accès. Un e-mail de bienvenue peut être envoyé automatiquement à la création.',
      },
    ],
  },

  '/warehouses/': {
    title: 'Détail d\'un entrepôt',
    chapters: [
      {
        title: 'Présentation',
        body: 'La fiche entrepôt affiche les informations générales du site de stockage et l\'état du stock par équipement. Chaque entrepôt est un point de gestion indépendant pour votre inventaire.',
      },
      {
        title: 'Informations générales',
        body: 'Modifiez le nom, l\'adresse et la ville de l\'entrepôt. Ces informations apparaissent dans les rapports de stock et les fiches d\'équipement pour indiquer la localisation du matériel.',
      },
      {
        title: 'Stock par équipement',
        body: 'Le tableau de stock liste tous les équipements associés à cet entrepôt avec leurs quantités disponibles et en location. Pour les équipements en série (tracés par QR), la liste détaille les unités individuelles. Modifiez les quantités directement dans le tableau.',
      },
    ],
  },

  '/warehouses': {
    title: 'Entrepôts',
    chapters: [
      {
        title: 'Présentation',
        body: 'La section Entrepôts gère vos sites de stockage. Chaque entrepôt est un conteneur logique pour votre inventaire. Le stock de chaque équipement est géré par entrepôt, ce qui permet de suivre la localisation précise du matériel.',
      },
      {
        title: 'Gestion des entrepôts',
        body: 'Créez, modifiez et supprimez vos entrepôts depuis cette liste. La recherche filtre par nom. Cliquez sur un entrepôt pour voir et gérer son inventaire complet.',
      },
      {
        title: 'Rôle dans l\'inventaire',
        body: 'Lors de la création ou de la modification d\'un équipement, vous définissez les quantités disponibles entrepôt par entrepôt. Pour les équipements en série (tracés par numéro de série et QR code), chaque unité est assignée à un entrepôt spécifique.',
      },
    ],
  },

  '/clients/': {
    title: 'Fiche client',
    chapters: [
      {
        title: 'Présentation',
        body: 'La fiche client regroupe toutes les informations d\'un contact ou d\'une entreprise : coordonnées, contacts multiples, historique des projets, et rattachement à une société. Elle est accessible depuis la liste des clients ou depuis une fiche projet.',
      },
      {
        title: 'Informations générales',
        body: 'Modifiez le nom, l\'e-mail principal, le téléphone, l\'adresse et les informations de facturation. Pour un client de type personne, vous pouvez le rattacher à une entreprise cliente existante via le champ de sélection.',
      },
      {
        title: 'Contacts',
        body: 'L\'onglet Contacts permet d\'ajouter plusieurs points de contact pour un même client : e-mail, téléphone, réseaux sociaux, site web, ou autre. Chaque contact peut être typé et libellé librement. Utile pour les clients ayant plusieurs interlocuteurs.',
      },
      {
        title: 'Historique des projets',
        body: 'L\'onglet Projets liste tous les projets (locations, prestations, ventes) associés à ce client, avec leur statut et montant. Cliquez sur un projet pour accéder à sa fiche directement.',
      },
      {
        title: 'Membres (entreprises)',
        body: 'Pour les clients de type entreprise, l\'onglet Membres liste les personnes physiques rattachées à cette société. Vous pouvez y rechercher des clients existants à lier, ou créer de nouveaux contacts directement depuis la fiche entreprise.',
      },
    ],
  },

  '/clients': {
    title: 'Clients',
    chapters: [
      {
        title: 'Présentation',
        body: 'La section Clients gère vos contacts clients en deux catégories distinctes : les personnes physiques et les entreprises. Un client peut être une personne indépendante ou être rattaché à une entreprise cliente.',
      },
      {
        title: 'Clients & entreprises',
        body: 'L\'onglet Clients liste les personnes physiques. L\'onglet Entreprises liste les sociétés clientes. Une personne peut être membre d\'une entreprise — ce lien est géré depuis la fiche de l\'entreprise ou de la personne.',
      },
      {
        title: 'Recherche',
        body: 'La barre de recherche filtre simultanément sur le nom, le nom de l\'entreprise, l\'e-mail et le téléphone. La liste se met à jour en temps réel à la saisie.',
      },
      {
        title: 'Créer un client',
        body: 'Cliquez sur Nouveau client pour créer une personne physique, ou sur Nouvelle entreprise depuis l\'onglet Entreprises. Les formulaires diffèrent légèrement selon le type. Les champs obligatoires sont le nom et l\'e-mail.',
      },
    ],
  },

  '/services/': {
    title: 'Détail d\'un service',
    chapters: [
      {
        title: 'Présentation',
        body: 'La fiche service affiche les détails d\'une prestation de votre catalogue : catégorie, statut, tarification et dates de validité. Les services sont utilisés dans les projets pour facturer des prestations humaines ou des assurances.',
      },
      {
        title: 'Informations',
        body: 'Modifiez le titre, la catégorie (assurance ou autre), le sous-type, le statut (actif, en attente, expiré, annulé) et les dates de validité. Le tarif unitaire est utilisé lors de l\'ajout du service à un projet.',
      },
      {
        title: 'Utilisation dans les projets',
        body: 'Les services du catalogue sont sélectionnables dans l\'étape Personnel du wizard de création de projet, et dans l\'onglet Personnel d\'un projet existant. Le tarif peut être ajusté par projet avec une remise en pourcentage.',
      },
    ],
  },

  '/services': {
    title: 'Services',
    chapters: [
      {
        title: 'Présentation',
        body: 'La section Services gère votre catalogue de prestations facturables hors matériel : assurances, prestations techniques, frais divers. Ces services sont associés aux projets pour être inclus dans les devis et factures.',
      },
      {
        title: 'Assurances',
        body: 'L\'onglet Assurances liste les couvertures proposables aux clients dans le cadre de leurs projets. Chaque assurance a un tarif, une période de validité et peut être appliquée avec une quantité et une remise.',
      },
      {
        title: 'Autres services',
        body: 'L\'onglet Autres services regroupe toutes les prestations qui ne sont pas des assurances : frais de port, prestations techniques, consommables facturés, etc. Ils s\'ajoutent aux projets de la même façon que les assurances.',
      },
      {
        title: 'Créer un service',
        body: 'Cliquez sur Nouveau service pour ouvrir le formulaire. Définissez le titre, le type (assurance ou autre), le sous-type libre, le tarif unitaire et le statut. Le service est immédiatement disponible dans les projets.',
      },
    ],
  },

  '/equipment/': {
    title: 'Fiche équipement',
    chapters: [
      {
        title: 'Présentation',
        body: 'La fiche équipement centralise toutes les informations d\'un matériel : caractéristiques techniques, stock, historique d\'utilisation, maintenance, accessoires, et conformité. C\'est le point d\'entrée pour toute gestion liée à un équipement spécifique.',
      },
      {
        title: 'Informations générales',
        body: 'Modifiez le nom, la catégorie, la sous-catégorie, le type d\'inventaire (série, vrac, consommable), le tarif journalier, le poids, le volume, la localisation interne et les notes. Le code QR est généré automatiquement pour les équipements en série.',
      },
      {
        title: 'Types d\'inventaire',
        body: (
          <ul className="space-y-1.5">
            {[['Série','Chaque unité est tracée individuellement par numéro de série et QR code. Idéal pour les équipements à haute valeur.'],['Vrac','Stock géré en quantité globale par entrepôt. Pour les équipements interchangeables.'],['Consommable','Stock qui se réduit à l\'usage, non récupéré après la prestation.']].map(([n,d])=>(
              <li key={n} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400"><span className="text-gray-300 flex-shrink-0">–</span><span><span className="font-medium text-gray-700 dark:text-gray-300">{n}</span> : {d}</span></li>
            ))}
          </ul>
        ),
      },
      {
        title: 'Stock & entrepôts',
        body: 'L\'onglet Stock affiche la répartition du matériel par entrepôt. Pour les équipements en série, chaque unité individuelle y est listée avec son numéro de série, sa localisation interne et son statut. Ajustez les quantités directement dans le tableau.',
      },
      {
        title: 'Réservations',
        body: 'Le Gantt de réservations affiche tous les projets sur lesquels cet équipement est affecté, sur une ligne de temps. Visualisez les chevauchements et les périodes de disponibilité d\'un seul coup d\'œil.',
      },
      {
        title: 'Maintenance',
        body: 'L\'onglet Maintenance liste les interventions passées et en cours sur cet équipement. Créez de nouvelles tâches de maintenance directement depuis la fiche. Les maintenances actives bloquent la disponibilité de l\'équipement.',
      },
      {
        title: 'Accessoires',
        body: 'L\'onglet Accessoires liste le petit matériel qui accompagne cet équipement (câbles, supports, housses, etc.). Les accessoires peuvent avoir leur propre stock et tarif, et être ajoutés automatiquement ou manuellement aux projets.',
      },
      {
        title: 'Conformité',
        body: 'L\'onglet Conformité permet de gérer les certifications et documents réglementaires associés à l\'équipement (contrôles périodiques, CE, etc.) avec leurs dates d\'échéance. Une alerte est déclenchée à l\'approche de l\'expiration.',
      },
      {
        title: 'Images',
        body: 'Ajoutez des photos de l\'équipement depuis l\'onglet principal. Les images sont stockées dans le cloud et visibles sur les fiches de maintenance. La première image sert de vignette dans la liste.',
      },
    ],
  },

  '/equipment': {
    title: 'Équipements',
    chapters: [
      {
        title: 'Présentation',
        body: 'La section Équipements gère l\'ensemble de votre parc matériel. Elle se divise en deux onglets : la liste des équipements individuels, et la liste des packs (ensembles prédéfinis d\'équipements).',
      },
      {
        title: 'Équipements',
        body: 'L\'onglet Équipements liste tout votre parc avec le statut, la catégorie, le type d\'inventaire et le tarif. Cliquez sur une ligne pour accéder à la fiche complète. Dupliquez un équipement via le menu contextuel pour créer rapidement une variante.',
      },
      {
        title: 'Packs',
        body: 'Un pack est un ensemble prédéfini d\'équipements vendus ou loués ensemble. Lors de l\'ajout d\'un pack à un projet, tous les équipements qui le composent sont ajoutés automatiquement. Gérez les packs depuis l\'onglet dédié.',
      },
      {
        title: 'Filtres',
        body: 'Filtrez la liste par statut (disponible, en location, maintenance, hors service), par catégorie et sous-catégorie. La recherche textuelle porte sur le nom, le type et le sous-type. Les filtres se cumulent.',
      },
      {
        title: 'Statuts équipements',
        body: (
          <ul className="space-y-1.5">
            {[['Disponible','Matériel prêt à être loué.'],['En location','Matériel actuellement sorti sur un projet.'],['Maintenance','Matériel immobilisé pour intervention.'],['Hors service','Matériel défectueux ou retraité temporairement.']].map(([n,d])=>(
              <li key={n} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400"><span className="text-gray-300 flex-shrink-0">–</span><span><span className="font-medium text-gray-700 dark:text-gray-300">{n}</span> : {d}</span></li>
            ))}
          </ul>
        ),
      },
      {
        title: 'Inventaire cyclique',
        body: 'Le bouton Inventaire ouvre le module d\'inventaire cyclique. Il permet de compter et valider le stock physique par rapport au stock théorique sur une période définie. Les écarts sont signalés pour correction.',
      },
      {
        title: 'Créer un équipement',
        body: 'Cliquez sur Nouvel équipement pour ouvrir le formulaire de création. Renseignez le nom, la catégorie, le type d\'inventaire, le tarif et les informations logistiques. Pour les équipements en série, ajoutez les unités individuelles après la création depuis l\'onglet Stock de la fiche.',
      },
    ],
  },

  '/rentals/': {
    title: 'Détail d\'un projet',
    chapters: [
      {
        title: 'Présentation',
        body: 'La fiche projet regroupe l\'ensemble des informations d\'une location, prestation ou vente : matériel, personnel, livraison, documents, finances et historique. Toutes les modifications sont enregistrées en temps réel et tracées dans le journal d\'activité.',
      },
      {
        title: 'Progression & statuts',
        body: (
          <div className="space-y-2">
            <p>La barre de progression en haut de la fiche indique l\'étape actuelle du projet. Les étapes sont dans cet ordre :</p>
            <ul className="space-y-1 mt-2">
              {[
                ['Créé', 'Le projet vient d\'être enregistré, en attente de validation.'],
                ['Validé', 'Le projet est confirmé par le responsable.'],
                ['Préparé', 'Le matériel a été préparé et vérifié avant départ.'],
                ['Livré', 'Le matériel est chez le client, la prestation a démarré.'],
                ['Livraison retour', 'Le matériel est en cours de rapatriement.'],
                ['Retourné', 'Le matériel est de retour en entrepôt.'],
                ['Payé', 'La facture a été réglée, le projet est clôturé.'],
              ].map(([name, desc]) => (
                <li key={name} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5">–</span>
                  <span><span className="font-medium text-gray-700 dark:text-gray-300">{name}</span> : {desc}</span>
                </li>
              ))}
            </ul>
          </div>
        ),
      },
      {
        title: 'Matériel',
        body: 'L\'onglet Matériel liste tous les équipements affectés au projet. Vous pouvez organiser les équipements en groupes, ajuster les quantités, appliquer des remises individuelles par ligne ou par groupe, et réordonner les éléments par glisser-déposer. Le catalogue s\'ouvre depuis le bouton + pour ajouter du matériel.',
      },
      {
        title: 'Personnel & services',
        body: 'L\'onglet Personnel permet d\'affecter des membres de l\'équipe au projet et d\'associer des prestations de service (technicien, chauffeur, assurance, autres). Chaque service peut avoir une quantité, un nombre de jours et une remise.',
      },
      {
        title: 'Livraison & logistique',
        body: 'Définissez ici les véhicules assignés, les créneaux de livraison et de retour, ainsi que le forfait livraison appliqué (tarif au km, à l\'heure, fixe ou à la journée). La logistique génère automatiquement des événements dans le calendrier.',
      },
      {
        title: 'Documents',
        body: 'Générez, envoyez et suivez les documents officiels du projet : devis, bon de préparation et facture. Chaque document peut être envoyé par e-mail directement depuis la fiche. Un devis peut être soumis à validation client via un lien de partage sécurisé.',
      },
      {
        title: 'Dates clés',
        body: 'Les jalons (milestones) permettent de définir des étapes importantes du projet avec une date et une description. Ils apparaissent sur la fiche et peuvent être utilisés pour structurer le suivi du projet.',
      },
      {
        title: 'Tâches & checklist',
        body: 'L\'onglet Tâches permet d\'organiser le travail interne lié au projet sous forme de listes de tâches et de checklists. Chaque tâche peut être assignée, colorée et cochée. Les checklists sont utiles pour les vérifications avant départ ou retour.',
      },
      {
        title: 'Dossier client',
        body: 'Le dossier client est un espace partageable avec le client. Il regroupe les documents du projet (devis, factures, contrats) accessibles via un lien sécurisé. Vous pouvez définir un mode d\'accès (public, protégé par mot de passe, liste blanche d\'e-mails) et une date d\'expiration.',
      },
      {
        title: 'Journal d\'activité',
        body: 'Toutes les actions effectuées sur le projet sont enregistrées automatiquement : modifications de statut, ajout/suppression de matériel, génération de documents, paiements, etc. Le journal est accessible depuis le panneau latéral de la fiche.',
      },
    ],
  },

  '/rentals': {
    title: 'Projets',
    chapters: [
      {
        title: 'Présentation',
        body: 'La liste des projets regroupe l\'ensemble de vos locations, prestations de service et ventes. Chaque ligne affiche le client, le type de projet, le statut, les dates et le montant total. Cliquez sur un projet pour accéder à sa fiche détaillée.',
      },
      {
        title: 'Types de projets',
        body: (
          <ul className="space-y-1.5">
            {[
              ['Location', 'Mise à disposition de matériel pour une durée déterminée. Le tarif est calculé selon le nombre de jours et les coefficients configurés.'],
              ['Prestation de service', 'Intervention avec du personnel technique ou artistique. Le matériel peut y être associé ou non.'],
              ['Vente', 'Cession définitive de matériel à un client. La disponibilité de l\'équipement n\'est pas bloquée dans le calendrier.'],
            ].map(([name, desc]) => (
              <li key={name} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <span className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5">–</span>
                <span><span className="font-medium text-gray-700 dark:text-gray-300">{name}</span> : {desc}</span>
              </li>
            ))}
          </ul>
        ),
      },
      {
        title: 'Statuts',
        body: (
          <ul className="space-y-1.5">
            {[
              ['En attente', 'Projet créé, pas encore validé.'],
              ['Confirmé', 'Projet validé, matériel réservé.'],
              ['En préparation', 'Le matériel est en cours de préparation.'],
              ['En cours', 'Prestation démarrée, matériel sorti.'],
              ['Livré', 'Matériel livré chez le client.'],
              ['Retour en cours', 'Le matériel revient vers l\'entrepôt.'],
              ['Retourné', 'Matériel de retour, en attente de contrôle.'],
              ['Terminé', 'Projet clôturé opérationnellement.'],
              ['Payé', 'Facture réglée, projet entièrement soldé.'],
              ['Annulé', 'Projet annulé, le matériel est libéré.'],
              ['Archivé', 'Projet archivé, masqué de la liste principale.'],
            ].map(([name, desc]) => (
              <li key={name} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <span className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5">–</span>
                <span><span className="font-medium text-gray-700 dark:text-gray-300">{name}</span> : {desc}</span>
              </li>
            ))}
          </ul>
        ),
      },
      {
        title: 'Filtres & recherche',
        body: 'La barre de recherche filtre par nom de client. Le panneau Filtres permet de combiner plusieurs critères : type de projet, statut, client spécifique et plage de montant (min/max). Les filtres s\'appliquent simultanément. Cliquez sur Filtrer pour valider, ou Réinitialiser pour tout effacer.',
      },
      {
        title: 'Créer un projet',
        body: (
          <div className="space-y-2">
            <p>Le wizard de création se déroule en 6 étapes :</p>
            <ul className="space-y-1.5 mt-2">
              {[
                ['Informations générales', 'Type, client, titre, dates, lieu, couleur de projet.'],
                ['Livraison', 'Véhicules, créneaux de livraison/retour, forfait livraison.'],
                ['Matériel', 'Ajout d\'équipements depuis le catalogue, création de groupes, réglage des quantités.'],
                ['Personnel', 'Affectation de membres de l\'équipe et de services associés.'],
                ['Tarification', 'Remise globale (en % ou montant fixe) sur l\'ensemble du projet.'],
                ['Récapitulatif', 'Vue d\'ensemble avant validation. Affiche le détail des coûts.'],
              ].map(([step, desc]) => (
                <li key={step} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5">–</span>
                  <span><span className="font-medium text-gray-700 dark:text-gray-300">{step}</span> : {desc}</span>
                </li>
              ))}
            </ul>
          </div>
        ),
      },
      {
        title: 'Projets archivés',
        body: 'Le bouton Archive en haut de la liste ouvre un panneau listant tous les projets archivés avec leur montant payé. Vous pouvez restaurer un projet archivé pour le faire réapparaître dans la liste principale avec son statut d\'origine.',
      },
      {
        title: 'Simulation disponibilité',
        body: 'Le bouton What-if permet de simuler la disponibilité du matériel sur une période donnée sans créer de projet. Utile pour vérifier rapidement si une demande client est réalisable avant de lancer une création.',
      },
    ],
  },

  '/calendar': {
    title: 'Calendrier',
    chapters: [
      {
        title: 'Présentation',
        body: 'Le calendrier centralise tous les événements liés à votre activité : locations, prestations de service, livraisons, retours, maintenances et événements manuels. Il offre une vue chronologique de votre planning complet sur trois niveaux de zoom.',
      },
      {
        title: 'Vues disponibles',
        body: (
          <ul className="space-y-2">
            {[
              ['Jour', 'Affiche les créneaux horaires d\'une seule journée. Idéal pour gérer un planning chargé ou visualiser les chevauchements sur une journée précise.'],
              ['Semaine', 'Vue par défaut. Affiche les 7 jours de la semaine en colonnes avec les créneaux horaires. Permet de voir l\'ensemble du planning à court terme.'],
              ['Mois', 'Vue compacte sur le mois entier. Les événements sont affichés sous forme de blocs colorés dans les cellules de chaque jour.'],
            ].map(([name, desc]) => (
              <li key={name} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <span className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5">–</span>
                <span><span className="font-medium text-gray-700 dark:text-gray-300">{name}</span> : {desc}</span>
              </li>
            ))}
          </ul>
        ),
      },
      {
        title: 'Types d\'événements',
        body: (
          <ul className="space-y-2">
            {[
              ['Locations', 'Générées automatiquement depuis vos projets de location. La durée correspond à la période de la prestation. Un clic redirige vers le détail du projet.'],
              ['Logistique', 'Représente les étapes de livraison et de retour associées à une location. Utile pour planifier les déplacements de matériel.'],
              ['Maintenance', 'Créneaux réservés pour les interventions planifiées ou correctives sur vos équipements. Un clic redirige vers la fiche de maintenance.'],
              ['Événements manuels', 'Réunions, tâches, rappels créés directement depuis le calendrier. Ils n\'ont pas de lien avec un projet ou un équipement.'],
            ].map(([name, desc]) => (
              <li key={name} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <span className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5">–</span>
                <span><span className="font-medium text-gray-700 dark:text-gray-300">{name}</span> : {desc}</span>
              </li>
            ))}
          </ul>
        ),
      },
      {
        title: 'Filtres',
        body: 'Les boutons de filtre en haut du calendrier permettent d\'afficher ou masquer chaque catégorie d\'événements indépendamment. Désactivez les catégories non pertinentes pour alléger la lecture du planning.',
      },
      {
        title: 'Créer un événement',
        body: 'Cliquez sur une plage horaire vide (vue jour ou semaine) ou sur une cellule de jour (vue mois) pour ouvrir le formulaire de création. Vous pouvez y définir un titre, un type (réunion, tâche, rappel), une heure de début et de fin, et une description.',
      },
      {
        title: 'Modifier un événement',
        body: 'Cliquez sur un événement manuel pour ouvrir sa fiche et le modifier ou le supprimer. Les événements automatiques (locations, maintenances) ne sont pas modifiables depuis le calendrier : ils doivent être mis à jour depuis leur fiche respective.',
      },
      {
        title: 'Navigation',
        body: 'Utilisez les flèches gauche et droite pour passer à la période précédente ou suivante. Le bouton Aujourd\'hui recentre immédiatement le calendrier sur la date du jour. La vue en cours est conservée lors de la navigation.',
      },
    ],
  },
  '/': {
    title: 'Tableau de bord',
    chapters: [
      {
        title: 'Présentation',
        body: 'Le tableau de bord est votre page d\'accueil personnalisable. Il regroupe en un coup d\'œil les informations les plus importantes de votre activité : locations en cours, alertes stock, planning du jour, revenus, et bien plus. Chaque bloc d\'information s\'appelle un widget.',
      },
      {
        title: 'Widgets disponibles',
        body: (
          <div className="space-y-2">
            <p>Voici les widgets que vous pouvez afficher sur votre tableau de bord :</p>
            <ul className="space-y-1 mt-2">
              {[
                ['Locations en attente', 'Projets non encore confirmés, en attente de validation.'],
                ['Locations à venir', 'Projets confirmés dont la date de début approche.'],
                ['Alertes stock', 'Équipements dont le stock disponible est bas.'],
                ['Statut équipements', 'Vue globale de l\'état du parc (disponible, en location, maintenance).'],
                ['Revenus', 'Graphique des revenus sur une période glissante.'],
                ['Activité récente', 'Dernières actions effectuées dans l\'application.'],
                ['Maintenance', 'Interventions en cours ou à venir sur vos équipements.'],
                ['Planning journalier', 'Mini-calendrier du jour avec les événements à venir.'],
                ['Top clients', 'Clients générant le plus de chiffre d\'affaires.'],
                ['Planning personnel', 'Gantt de l\'affectation de votre équipe sur les projets.'],
                ['Météo', 'Conditions météo pour anticiper vos prestations extérieures.'],
                ['Horloge / Date', 'Affichage de l\'heure et de la date en temps réel.'],
              ].map(([name, desc]) => (
                <li key={name} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  <span className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5">–</span>
                  <span><span className="font-medium text-gray-700 dark:text-gray-300">{name}</span> : {desc}</span>
                </li>
              ))}
            </ul>
          </div>
        ),
      },
      {
        title: 'Mode édition',
        body: 'Cliquez sur le bouton Modifier en haut à droite du tableau de bord pour entrer en mode édition. Ce mode vous permet d\'ajouter, déplacer, redimensionner ou supprimer des widgets librement. Les modifications sont sauvegardées automatiquement.',
      },
      {
        title: 'Déplacer un widget',
        body: 'En mode édition, maintenez le clic sur l\'en-tête d\'un widget et faites-le glisser vers la position souhaitée. La grille se réorganise automatiquement pour s\'adapter à votre mise en page.',
      },
      {
        title: 'Redimensionner un widget',
        body: 'Chaque widget possède une poignée de redimensionnement en bas à droite. Faites-la glisser pour ajuster la largeur et/ou la hauteur. Certains widgets ont une taille minimale en dessous de laquelle ils ne peuvent pas être réduits.',
      },
      {
        title: 'Ajouter un widget',
        body: 'En mode édition, cliquez sur "+ Ajouter un widget" pour ouvrir la bibliothèque de widgets disponibles. Sélectionnez-en un dans la liste et il sera ajouté en bas de votre tableau de bord. Vous pourrez ensuite le déplacer à l\'endroit souhaité.',
      },
      {
        title: 'Conseils',
        body: (
          <ul className="space-y-1.5">
            {[
              'La mise en page est sauvegardée automatiquement et propre à chaque utilisateur.',
              'Certains widgets sont configurables : cliquez sur l\'icône ⚙️ dans leur en-tête pour accéder aux options.',
              'Si un widget ne s\'actualise pas, rechargez la page pour forcer la mise à jour des données.',
              'Vous pouvez revenir à la mise en page par défaut depuis le mode édition.',
            ].map((tip, i) => (
              <li key={i} className="flex gap-2 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                <span className="text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5">–</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        ),
      },
    ],
  },
};

function resolveHelpPage(pathname: string): HelpPage | null {
  // Exact match first
  if (HELP_CONTENT[pathname]) return HELP_CONTENT[pathname];
  // Prefix match — longest key first so more specific paths win
  const sorted = Object.keys(HELP_CONTENT)
    .filter((k) => k !== '/' && k !== pathname)
    .sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (pathname.startsWith(key)) return HELP_CONTENT[key];
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const HelpPanel: React.FC<HelpPanelProps> = ({ isOpen, onClose }) => {
  const { pathname } = useLocation();
  const page = resolveHelpPage(pathname);
  const [activeChapter, setActiveChapter] = useState(0);

  // Reset chapter when page changes or panel opens
  useEffect(() => {
    if (isOpen) setActiveChapter(0);
  }, [isOpen, pathname]);

  const chapter = page?.chapters[activeChapter];

  return (
    <>
      {/* Transparent full-screen overlay — closes the panel on outside click */}
      {createPortal(
        <div
          className="fixed inset-0 z-[44]"
          style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
          onMouseDown={onClose}
        />,
        document.body,
      )}

      <div
        className="absolute right-0 top-full mt-2 z-[12010] origin-top-right"
      style={{
        opacity: isOpen ? 1 : 0,
        transform: isOpen ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(-6px)',
        transition: 'opacity 180ms ease, transform 180ms ease',
        pointerEvents: isOpen ? 'auto' : 'none',
        width: '680px',
      }}
    >
      <div className="rounded-xl shadow-2xl ring-1 ring-black/[0.07] dark:ring-white/[0.07] bg-white dark:bg-gray-900 overflow-hidden flex">

        {/* ── Left: chapter list ── */}
        <div className="w-52 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 py-3">
          {page ? (
            <>
              <div className="px-4 pb-2">
                <span className="text-[10px] font-bold text-gray-300 dark:text-gray-600 uppercase tracking-widest">
                  {page.title}
                </span>
              </div>
              <ul>
                {page.chapters.map((ch, i) => (
                  <li key={i}>
                    <button
                      onClick={() => setActiveChapter(i)}
                      className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                        activeChapter === i
                          ? 'text-gray-900 dark:text-gray-100 font-semibold bg-gray-50 dark:bg-gray-800'
                          : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50/60 dark:hover:bg-gray-800/60'
                      }`}
                    >
                      {ch.title}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="px-4 py-3">
              <span className="text-[10px] font-bold text-gray-300 dark:text-gray-600 uppercase tracking-widest">
                Aide
              </span>
            </div>
          )}
        </div>

        {/* ── Right: chapter content ── */}
        <div className="flex-1 min-w-0 px-6 py-5 overflow-y-auto max-h-96">
          {chapter ? (
            <>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {chapter.title}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                {chapter.body}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-600">
              Aucune aide disponible pour cette page.
            </div>
          )}
        </div>

      </div>
    </div>
    </>
  );
};

export default HelpPanel;
