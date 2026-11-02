# StylePro Manager — checklist de validation

Cette checklist sert à valider l'application avec une vraie boutique et des données de test contrôlées. Ne pas utiliser de données fictives dans une base de production.

## 1. Préparation
- [ ] Vérifier que les variables Vite Supabase sont présentes dans `.env.local` (URL et clé publishable uniquement).
- [ ] Vérifier que le compte connecté appartient à la boutique attendue.
- [ ] Faire une sauvegarde Supabase avant toute migration ou modification de schéma.
- [ ] Ne jamais placer une clé `service_role` dans le navigateur, dans `VITE_*` ou dans l'application mobile.
- [ ] Confirmer que les politiques RLS limitent chaque utilisateur aux boutiques auxquelles il appartient.

## 2. Authentification
- [ ] Connexion avec un compte existant.
- [ ] Déconnexion puis reconnexion.
- [ ] Demande de réinitialisation du mot de passe.
- [ ] Ouvrir le lien reçu par e-mail et définir un nouveau mot de passe.
- [ ] Vérifier qu'un visiteur ne peut pas créer librement un compte si l'inscription publique est désactivée.

## 3. Boutique et catalogue
- [ ] Vérifier le nom et la devise de la boutique.
- [ ] Créer puis modifier un article réel.
- [ ] Ajouter plusieurs variantes (taille/couleur), SKU et code-barres.
- [ ] Vérifier que les données d'une autre boutique ne sont jamais visibles.

## 4. Stock
- [ ] Enregistrer une entrée, une sortie et une correction d'inventaire.
- [ ] Vérifier qu'une correction à zéro est acceptée et qu'une sortie supérieure au stock est refusée.
- [ ] Transférer du stock entre Boutique et Réserve.
- [ ] Contrôler le journal des mouvements et les indicateurs de stock.
- [ ] Vérifier les quantités depuis la caisse après chaque mouvement.

## 5. Caisse et ventes
- [ ] Ajouter un article au panier et modifier la quantité.
- [ ] Vérifier le refus d'une quantité nulle, négative, décimale ou supérieure au stock affiché.
- [ ] Tester espèces, carte et paiement mixte.
- [ ] Vérifier le refus d'un paiement insuffisant.
- [ ] Finaliser une vente et contrôler la décrémentation du stock.
- [ ] Ouvrir et imprimer le ticket/facture.
- [ ] Vérifier le mode de paiement enregistré en base : la RPC actuelle ne garantit pas encore sa persistance.

## 6. Retours et remboursements
- [ ] Retrouver une vente réelle.
- [ ] Retourner une quantité partielle puis vérifier le solde retournable.
- [ ] Vérifier le statut et le mouvement de stock selon le choix de remise en stock.
- [ ] Vérifier que la même ligne ne peut pas être remboursée deux fois au-delà de la quantité vendue.

## 7. Atelier
- [ ] Ajouter un fournisseur tissu et un fournisseur confection.
- [ ] Créer une production avec référence tissu, métrage et prix au mètre.
- [ ] Ajouter plusieurs modèles, couleurs et tailles.
- [ ] Contrôler les totaux par taille, modèle et production, ainsi que le coût et la marge.
- [ ] Vérifier l'enregistrement puis la réouverture d'une production existante.

## 8. Livraisons
- [ ] Créer un brouillon multi-articles depuis Boutique et/ou Réserve.
- [ ] Vérifier qu'un brouillon ne déduit pas le stock.
- [ ] Confirmer la sortie et contrôler le stock.
- [ ] Effectuer un retour partiel avec état du produit et destination de rangement.
- [ ] Vérifier historique, filtres, détails et impression.
- [ ] Confirmer que les identifiants Boutique/Réserve sont bien propres à la boutique active avant utilisation multi-boutique.

## 9. Scanner mobile, QR et étiquettes
- [ ] Démarrer puis arrêter la caméra.
- [ ] Quitter l'écran pendant le démarrage de la caméra et vérifier qu'aucun flux ne reste actif.
- [ ] Tester la liaison du scanner mobile et la réception du code sur le PC.
- [ ] Imprimer une planche QR A4 et une étiquette thermique si l'imprimante le permet.

## 10. Tableau de bord, statistiques et apparence
- [ ] Vérifier que les graphiques reflètent les ventes et dépenses réelles de la période.
- [ ] Vérifier les indicateurs de retours et de stock faible.
- [ ] Tester les thèmes Clair, Sombre et Système.
- [ ] Tester chaque couleur d'accent et vérifier le contraste dans les formulaires, tableaux, fenêtres et modules Atelier/Livraison.
- [ ] Recharger la page et vérifier que le thème et la couleur restent mémorisés.

## 11. Contrôles techniques avant mise en production
- [ ] GitHub Actions : étapes `npm ci`, `npm run build` et `npm run lint` vertes.
- [ ] Exécuter le script `supabase/00_read_only_security_audit.sql` dans l'éditeur SQL en lecture seule et examiner les résultats.
- [ ] Vérifier les tables, colonnes, contraintes, fonctions RPC, politiques RLS et buckets Storage utilisés par Atelier et Livraison.
- [ ] Vérifier que `confirm_delivery` et `return_delivery_items` sont atomiques et revalident les quantités côté serveur.
- [ ] Remplacer les UUID Boutique/Réserve codés en dur par des identifiants résolus à partir de la boutique active, après confirmation du schéma.
- [ ] Ajouter la persistance du moyen de paiement dans une migration/RPC revue et testée.
- [ ] Tester avec deux comptes appartenant à deux boutiques différentes pour confirmer l'isolation des données.

## État connu
Le workflow CI vient d'être ajouté, mais il n'a pas encore été exécuté. Le script SQL d'audit est en lecture seule et n'a pas été exécuté. Aucune migration Supabase ni modification de données n'est incluse dans cette branche.
