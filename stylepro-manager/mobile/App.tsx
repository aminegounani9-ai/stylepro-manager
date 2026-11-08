import React, { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useNetworkState } from 'expo-network'
import { enqueueMobileSyncOperation, findCachedScannerVariant, getCachedProducts, getMobileCacheInfo, getMobileSyncQueueSummary, replaceScannerCatalog, upsertScannerVariant } from './src/lib/offlineStore'
import { startMobileSyncScheduler } from './src/lib/mobileSyncEngine'
import {
  AlertTriangle,
  Bell,
  ScanLine,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  LogIn,
  LogOut,
  Package,
  RefreshCw,
  ShoppingBag,
  Store as StoreIcon,
  TrendingUp,
  Wallet,
} from 'lucide-react-native'
import type { User } from '@supabase/supabase-js'
import { supabase } from './src/lib/supabase'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

type StoreRow = {
  id: string
  name: string
  currency: string
}

type ProductRow = {
  id: string
  name: string
  target_audience: string | null
  description: string | null
  active: boolean
}

type SaleRow = {
  id: string
  sale_number: number
  total: number
  status: string
  created_at: string
  completed_at: string | null
}

type ReturnRow = {
  sale_id: string
  total: number
  created_at: string
}

type ExpenseRow = {
  amount: number
  expense_date: string
}

type LowStockRow = {
  id: string
  sku: string
  current: number
  minimum: number
}

const COLORS = {
  background: '#F1EBDD',
  surface: '#FFFCF6',
  navy: '#202C3C',
  text: '#263243',
  muted: '#7B817F',
  border: '#DED6C6',
  accent: '#B58A52',
  danger: '#B94242',
  green: '#28734D',
  paleGreen: '#E3EFE5',
  paleBlue: '#E5EBF3',
  paleGold: '#F2E8D6',
  paleRed: '#F7E5E1',
}

function money(value: number, currency: string) {
  return `${value.toLocaleString('fr-DZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}

const AR: Record<string,string> = {
  'MANAGER · ESPACE COMMERCIAL':'المدير · الفضاء التجاري',
  'TABLEAU DE BORD':'لوحة التحكم','Bonjour 👋':'مرحباً 👋',
  'Boutique sélectionnée':'المتجر المحدد','Aucune boutique accessible':'لا يوجد متجر متاح',
  'Scanner QR / Code-barres':'مسح QR / الرمز الشريطي',
  'Accueil':'الرئيسية','Catalogue':'الكتالوج','Ventes':'المبيعات','Stock':'المخزون',
  'Retours':'المرتجعات','Clients':'الزبائن','Dépenses':'المصاريف','Atelier':'الورشة',
  'Livraisons':'التوصيل','Promos':'العروض','Étiquettes':'الملصقات',
  'Utilisateurs':'المستخدمون','Paramètres':'الإعدادات',
  'Performance commerciale':'الأداء التجاري','Les chiffres de votre boutique':'إحصائيات متجرك',
  "Ventes nettes aujourd'hui":'صافي مبيعات اليوم','Ventes nettes du mois':'صافي مبيعات الشهر',
  'Panier moyen du mois':'متوسط قيمة السلة للشهر','Dépenses du mois':'مصاريف الشهر',
  'Valeur du stock':'قيمة المخزون','Stock faible':'مخزون منخفض',
  'Évolution des ventes':'تطور المبيعات','Ventes récentes':'أحدث المبيعات',
  'Dernières factures complétées':'آخر الفواتير المكتملة',
  'Aucune vente complétée':'لا توجد مبيعات مكتملة',
  'Les factures terminées apparaîtront ici.':'ستظهر الفواتير المكتملة هنا.',
  'Alertes de stock':'تنبيهات المخزون','Paramètres de l’application':'إعدادات التطبيق',
  'Actualiser les données':'تحديث البيانات','Déconnexion':'تسجيل الخروج',
  'Période':'الفترة','7 derniers jours':'آخر 7 أيام','30 derniers jours':'آخر 30 يوماً',
  'Ce mois':'هذا الشهر','Personnalisée':'فترة مخصصة',
  'Du (AAAA-MM-JJ)':'من (YYYY-MM-DD)','Au (AAAA-MM-JJ)':'إلى (YYYY-MM-DD)',
  'Rapport PDF':'تقرير PDF','Langue':'اللغة','Français':'الفرنسية','العربية':'العربية',
  'Ventes brutes':'إجمالي المبيعات','Ventes nettes':'صافي المبيعات',
  'Facture':'الفاتورة','Date':'التاريخ','Montant':'المبلغ',
  'Rapport PDF prêt à partager.':'تقرير PDF جاهز للمشاركة.',
  'Impossible de générer le PDF':'تعذر إنشاء تقرير PDF',
  'Aucune vente sur cette période':'لا توجد مبيعات خلال هذه الفترة'
}

function createLocalUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function dateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('fr-DZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function MetricCard({
  title,
  value,
  detail,
  icon,
  tone = 'gold',
}: {
  title: string
  value: string
  detail: string
  icon: React.ReactNode
  tone?: 'gold' | 'green' | 'blue' | 'red'
}) {
  const iconBackground =
    tone === 'green' ? COLORS.paleGreen :
    tone === 'blue' ? COLORS.paleBlue :
    tone === 'red' ? COLORS.paleRed : COLORS.paleGold

  const iconColor =
    tone === 'green' ? COLORS.green :
    tone === 'blue' ? '#45658D' :
    tone === 'red' ? COLORS.danger : COLORS.accent

  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: iconBackground }]}>
        {React.isValidElement(icon)
          ? React.cloneElement(icon as React.ReactElement<{ color?: string }>, {
              color: iconColor,
            })
          : icon}
      </View>
      <Text style={styles.metricTitle}>{title}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  )
}

const MOBILE_MODULE_FOR_VIEW: Record<string, string> = {
  dashboard: 'dashboard', products: 'catalogue', sales: 'sales', stock: 'stock',
  returns: 'returns', clients: 'clients', expenses: 'expenses', atelier: 'atelier',
  deliveries: 'deliveries', promotions: 'promotions', labels: 'labels', users: 'users', settings: 'settings',
}

function AppContent() {
  const { width: windowWidth } = useWindowDimensions()
  const networkState = useNetworkState()
  const isOnline = networkState.isConnected === true && networkState.isInternetReachable !== false
  const compactScreen = windowWidth < 380
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [stores, setStores] = useState<StoreRow[]>([])
  const [storeId, setStoreId] = useState('')
  const [mobileRole, setMobileRole] = useState<string | null>(null)
  const [mobileModuleGrants, setMobileModuleGrants] = useState<Record<string, { can_view: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean }>>({})
  const canViewMobileModule = useCallback((viewKey: string) => mobileRole === 'admin' || mobileModuleGrants[MOBILE_MODULE_FOR_VIEW[viewKey]]?.can_view === true, [mobileRole, mobileModuleGrants])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [sales, setSales] = useState<SaleRow[]>([])
  const [returns, setReturns] = useState<ReturnRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [lowStock, setLowStock] = useState<LowStockRow[]>([])
  const [stockValue, setStockValue] = useState(0)
  const [totalStockUnits, setTotalStockUnits] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([])
  const [view, setView] = useState<'dashboard' | 'products' | 'sales' | 'stock' | 'returns' | 'clients' | 'expenses' | 'atelier' | 'deliveries' | 'promotions' | 'labels' | 'users' | 'settings'>('dashboard')
  const [moduleRows, setModuleRows] = useState<Record<string, unknown>[]>([])
  const [moduleLoading, setModuleLoading] = useState(false)
  const [moduleSearch, setModuleSearch] = useState('')
  const [userMembers, setUserMembers] = useState<Record<string, unknown>[]>([])
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState('cashier')
  const [userSaving, setUserSaving] = useState(false)
  const [storePickerOpen, setStorePickerOpen] = useState(false)
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanLocked, setScanLocked] = useState(false)
  const [scannerLoading, setScannerLoading] = useState(false)
  const [scanResult, setScanResult] = useState<{
    code: string
    name: string
    sku: string
    size: string
    color: string
    price: number
    stock: number | null
  } | null>(null)
  const [scanMessage, setScanMessage] = useState('')
  const [hardwareScannerCode, setHardwareScannerCode] = useState('')
  const [language, setLanguage] = useState<'fr'|'ar'>('fr')
  const [period, setPeriod] = useState<'7d'|'30d'|'month'|'custom'>('7d')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [mobileCacheCount, setMobileCacheCount] = useState(0)
  const [mobileCacheSyncedAt, setMobileCacheSyncedAt] = useState<string | null>(null)
  const [mobileQueuePending, setMobileQueuePending] = useState(0)
  const [mobileQueueErrors, setMobileQueueErrors] = useState(0)
  const t = (value: string) => language === 'ar' ? (AR[value] || value) : value

  const currentStore = stores.find(store => store.id === storeId)
  const currency = currentStore?.currency || 'DZD'
  const notificationStorageKey = user && storeId ? `stylepro.notifications.read.${user.id}.${storeId}` : ''
  const notificationIds = [...lowStock.map(item => `stock:${item.id}`), ...sales.slice(0, 5).map(item => `sale:${item.id}`), ...returns.slice(0, 5).map((item, index) => `return:${item.sale_id}:${index}`)]
  const unreadNotifications = notificationIds.filter(id => !readNotificationIds.includes(id))

  useEffect(() => {
    let active = true
    async function loadReadNotifications() {
      if (!notificationStorageKey) {
        setReadNotificationIds([])
        return
      }
      try {
        const stored = await AsyncStorage.getItem(notificationStorageKey)
        if (active) setReadNotificationIds(stored ? JSON.parse(stored) as string[] : [])
      } catch {
        if (active) setReadNotificationIds([])
      }
    }
    void loadReadNotifications()
    return () => { active = false }
  }, [notificationStorageKey])

  async function openNotifications() {
    setNotificationsOpen(true)
    const ids = notificationIds
    setReadNotificationIds(ids)
    if (notificationStorageKey) {
      try { await AsyncStorage.setItem(notificationStorageKey, JSON.stringify(ids)) } catch { /* Notifications remain visible for this session. */ }
    }
  }

  useEffect(() => {
    let alive = true

    async function restoreSession() {
      const { data, error } = await supabase.auth.getSession()
      if (!alive) return
      if (error) setError(error.message)
      setUser(data.session?.user ?? null)
      setReady(true)
    }

    void restoreSession()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null),
    )

    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const loadStores = useCallback(async () => {
    const { data, error } = await supabase
      .from('stores')
      .select('id,name,currency')
      .order('created_at', { ascending: true })

    if (error) throw new Error(`Boutiques : ${error.message}`)

    const rows = (data ?? []) as StoreRow[]
    setStores(rows)
    setStoreId(current =>
      rows.some(row => row.id === current) ? current : rows[0]?.id ?? '',
    )
  }, [])

  const loadProducts = useCallback(async (id: string) => {
    if (!id) {
      setProducts([])
      return
    }

    const { data, error } = await supabase
      .from('products')
      .select('id,name,target_audience,description,active')
      .eq('store_id', id)
      .order('name')

    if (error) {
      const cached = await getCachedProducts(id)
      if (cached.length > 0) {
        setProducts(cached as ProductRow[])
        return
      }
      throw new Error(`Catalogue : ${error.message}`)
    }
    setProducts((data ?? []) as ProductRow[])
  }, [])

  const syncMobileScannerCatalog = useCallback(async (id: string) => {
    if (!id) return { itemCount: 0, lastSyncedAt: null as string | null }
    type Variant = {
      id: string; product_id: string; sku: string | null; barcode: string | null;
      qr_token: string | null; size: string | null; color: string | null;
      sale_price: number | string | null; active: boolean
    }
    type Product = { id: string; name: string }
    type Movement = { variant_id: string; quantity_delta: number | string | null }

    const variants: Variant[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('product_variants')
        .select('id,product_id,sku,barcode,qr_token,size,color,sale_price,active')
        .eq('store_id', id).eq('active', true)
        .order('id').range(offset, offset + 999)
      if (error) throw error
      const page = (data ?? []) as Variant[]
      variants.push(...page)
      if (page.length < 1000) break
    }

    const productsRows: Product[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('products')
        .select('id,name').eq('store_id', id).order('id')
        .range(offset, offset + 999)
      if (error) throw error
      const page = (data ?? []) as Product[]
      productsRows.push(...page)
      if (page.length < 1000) break
    }

    const movements: Movement[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('stock_movements')
        .select('id,variant_id,quantity_delta').eq('store_id', id)
        .order('id').range(offset, offset + 999)
      if (error) throw error
      const page = (data ?? []) as Movement[]
      movements.push(...page)
      if (page.length < 1000) break
    }

    const names = new Map(productsRows.map(product => [product.id, product.name]))
    const stock: Record<string, number> = {}
    for (const movement of movements) {
      stock[movement.variant_id] = (stock[movement.variant_id] ?? 0) + Number(movement.quantity_delta ?? 0)
    }
    const cached = variants.map(variant => ({
      id: variant.id, store_id: id, product_id: variant.product_id,
      sku: variant.sku, barcode: variant.barcode, qr_token: variant.qr_token,
      size: variant.size, color: variant.color, sale_price: Number(variant.sale_price ?? 0),
      active: variant.active, product_name: names.get(variant.product_id) ?? 'Produit',
      current_stock: stock[variant.id] ?? 0,
    }))
    const info = await replaceScannerCatalog(id, cached)
    setMobileCacheCount(info.itemCount)
    setMobileCacheSyncedAt(info.lastSyncedAt)
    return info
  }, [])

  const loadAnalytics = useCallback(async (id: string) => {
    if (!id) {
      setSales([])
      setReturns([])
      setExpenses([])
      setLowStock([])
      setStockValue(0)
      setTotalStockUnits(0)
      return
    }

    const [salesResult, expensesResult, returnsResult, variantsResult, movementsResult] =
      await Promise.all([
        supabase
          .from('sales')
          .select('id,sale_number,total,status,created_at')
          .eq('store_id', id)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('expenses')
          .select('amount,expense_date')
          .eq('store_id', id),
        supabase
          .from('returns')
          .select('sale_id,total,created_at')
          .eq('store_id', id),
        supabase
          .from('product_variants')
          .select('id,sku,min_stock,purchase_cost,active')
          .eq('store_id', id)
          .eq('active', true),
        supabase
          .from('stock_movements')
          .select('variant_id,quantity_delta')
          .eq('store_id', id),
      ])

    if (salesResult.error) {
      throw new Error(`Ventes : ${salesResult.error.message}`)
    }

    const warnings: string[] = []
    if (expensesResult.error) warnings.push(`dépenses: ${expensesResult.error.message}`)
    if (returnsResult.error) warnings.push(`retours: ${returnsResult.error.message}`)
    if (variantsResult.error) warnings.push(`variantes: ${variantsResult.error.message}`)
    if (movementsResult.error) warnings.push(`mouvements de stock: ${movementsResult.error.message}`)

    const salesRows = (salesResult.data ?? []) as SaleRow[]
    const returnRows = returnsResult.error ? [] : ((returnsResult.data ?? []) as ReturnRow[])
    const expenseRows = expensesResult.error ? [] : ((expensesResult.data ?? []) as ExpenseRow[])
    const variants = variantsResult.error ? [] : (variantsResult.data ?? [])
    const movements = movementsResult.error ? [] : (movementsResult.data ?? [])

    const stock: Record<string, number> = {}
    for (const movement of movements) {
      stock[movement.variant_id] =
        (stock[movement.variant_id] ?? 0) + Number(movement.quantity_delta ?? 0)
    }

    const alerts = variants
      .map(variant => ({
        id: variant.id,
        sku: variant.sku || 'Sans référence',
        current: stock[variant.id] ?? 0,
        minimum: Number(variant.min_stock ?? 0),
      }))
      .filter(row => row.minimum > 0 && row.current <= row.minimum)
      .sort((a, b) => a.current - b.current)

    let units = 0
    let value = 0
    for (const variant of variants) {
      const quantity = stock[variant.id] ?? 0
      units += quantity
      value += quantity * Number(variant.purchase_cost ?? 0)
    }

    setSales(salesRows)
    setReturns(returnRows)
    setExpenses(expenseRows)
    setLowStock(alerts)
    setStockValue(value)
    setTotalStockUnits(units)
    if (warnings.length) {
      setError(`Tableau de bord partiel — ${warnings.join(' ; ')}`)
    }
  }, [])

  const refreshAll = useCallback(async (manual = false) => {
    if (!user) return

    if (manual) setRefreshing(true)
    else setLoading(true)

    setError('')

    try {
      await loadStores()
      // A manual refresh must also refresh the currently selected store's data.
      if (manual && storeId) {
        await Promise.all([loadProducts(storeId), loadAnalytics(storeId), syncMobileScannerCatalog(storeId)])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d’actualiser les données.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user, loadStores, storeId, loadProducts, loadAnalytics, syncMobileScannerCatalog])

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Refresh the authenticated mobile workspace asynchronously.
      void refreshAll()
    }
    else {
      setStores([])
      setStoreId('')
      setProducts([])
      setSales([])
      setReturns([])
      setExpenses([])
      setLowStock([])
      setStockValue(0)
      setTotalStockUnits(0)
    }
  // The auth transition intentionally resets screen state when the user signs out.
  }, [user, refreshAll])

  useEffect(() => {
    if (!user || !storeId) return
    let active = true
    async function prepareOfflineCache() {
      try {
        const info = await getMobileCacheInfo(storeId)
        if (active) {
          setMobileCacheCount(info.itemCount)
          setMobileCacheSyncedAt(info.lastSyncedAt)
        }
        if (isOnline) await syncMobileScannerCatalog(storeId)
      } catch {
        // Preserve the last good SQLite snapshot when Supabase is unreachable.
      }
    }
    void prepareOfflineCache()
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active' && isOnline) {
        void syncMobileScannerCatalog(storeId).catch(() => undefined)
      }
    })
    return () => {
      active = false
      appStateSubscription.remove()
    }
  }, [user, storeId, isOnline, syncMobileScannerCatalog])

  useEffect(() => {
    if (!user || !storeId) return
    let active = true
    const refreshQueue = async () => {
      try {
        const summary = await getMobileSyncQueueSummary(storeId)
        if (active) {
          setMobileQueuePending(summary.pending + summary.processing)
          setMobileQueueErrors(summary.errors)
        }
      } catch {
        // Keep the last displayed queue counters if SQLite is temporarily unavailable.
      }
    }
    void refreshQueue()
    const timer = setInterval(() => void refreshQueue(), 5_000)
    const stopScheduler = startMobileSyncScheduler(storeId, isOnline)
    return () => {
      active = false
      clearInterval(timer)
      stopScheduler()
    }
  }, [user, storeId, isOnline])

  useEffect(() => {
    if (!user || !storeId) return

    let active = true

    async function loadStoreData() {
      setLoading(true)
      setError('')

      try {
        await Promise.all([
          loadProducts(storeId),
          loadAnalytics(storeId),
        ])
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Erreur de chargement.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadStoreData()

    return () => {
      active = false
    }
  }, [user, storeId, loadProducts, loadAnalytics])

  useEffect(() => {
    let active = true
    async function loadMobileAccess() {
      if (!user || !storeId) {
        setMobileRole(null)
        setMobileModuleGrants({})
        return
      }
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'my_permissions', store_id: storeId },
      })
      if (!active) return
      if (error || data?.error || !data?.role) {
        setMobileRole(null)
        setMobileModuleGrants({})
        return
      }
      setMobileRole(data.role)
      if (data.is_global_admin === true || data.role === 'admin') {
        setMobileModuleGrants({})
        return
      }
      const next: Record<string, { can_view: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean }> = {}
      for (const grant of data.permissions || []) next[grant.module_key] = {
        can_view: grant.can_view === true, can_add: grant.can_add === true,
        can_edit: grant.can_edit === true, can_delete: grant.can_delete === true,
      }
      setMobileModuleGrants(next)
    }
    void loadMobileAccess()
    return () => { active = false }
  }, [user, storeId])

  useEffect(() => {
    if (!mobileRole) return
    if (!canViewMobileModule(view)) {
      const firstAllowed = ['products', 'sales', 'stock', 'returns', 'clients', 'expenses', 'atelier', 'deliveries', 'promotions', 'labels', 'settings']
        .find(key => canViewMobileModule(key))
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep the mobile screen within the user's server-authorized modules.
      setView((firstAllowed || 'dashboard') as typeof view)
    }
  }, [mobileRole, mobileModuleGrants, view, canViewMobileModule])

  const moduleLabels: Record<string, string> = {
    products: 'Catalogue', sales: 'Ventes', stock: 'Gestion du stock', returns: 'Retours',
    clients: 'Clients', expenses: 'Dépenses', atelier: 'Atelier', deliveries: 'Livraisons',
    promotions: 'Promotions', labels: 'Étiquettes QR', users: 'Utilisateurs', settings: 'Paramètres'
  }

  async function loadModule(nextView: typeof view) {
    if (!storeId || nextView === 'dashboard' || nextView === 'settings') {
      setModuleRows([]); setView(nextView); return
    }
    setModuleLoading(true); setError(''); setModuleSearch('')
    try {
      if (nextView === 'products') {
        setModuleRows(products.map(row => ({ ...row })))
      } else if (nextView === 'sales') {
        const { data, error } = await supabase.from('sales').select('id,sale_number,total,status,created_at,currency').eq('store_id', storeId).order('created_at', { ascending: false }).limit(200)
        if (error) throw error
        setModuleRows((data ?? []) as Record<string, unknown>[])
      } else if (nextView === 'stock') {
        const [variantsResult, movementResult, productResult] = await Promise.all([
          supabase.from('product_variants').select('id,product_id,sku,barcode,size,color,min_stock,sale_price,active').eq('store_id', storeId).eq('active', true),
          supabase.from('stock_movements').select('variant_id,quantity_delta').eq('store_id', storeId),
          supabase.from('products').select('id,name').eq('store_id', storeId)
        ])
        if (variantsResult.error) throw variantsResult.error
        if (movementResult.error) throw movementResult.error
        if (productResult.error) throw productResult.error
        const quantities: Record<string, number> = {}
        for (const movement of movementResult.data ?? []) quantities[movement.variant_id] = (quantities[movement.variant_id] ?? 0) + Number(movement.quantity_delta ?? 0)
        const names = new Map<string, string>((productResult.data ?? []).map(product => [product.id, product.name] as const))
        setModuleRows((variantsResult.data ?? []).map(variant => ({ ...variant, product_name: names.get(variant.product_id) ?? 'Produit', current_stock: quantities[variant.id] ?? 0 })))
      } else if (nextView === 'returns') {
        const { data, error } = await supabase.from('returns').select('sale_id,total,created_at').eq('store_id', storeId).order('created_at', { ascending: false }).limit(200)
        if (error) throw error
        setModuleRows((data ?? []) as Record<string, unknown>[])
      } else if (nextView === 'clients') {
        const { data, error } = await supabase.from('customers').select('id,full_name,phone').eq('store_id', storeId).order('full_name').limit(300)
        if (error) throw error
        setModuleRows((data ?? []) as Record<string, unknown>[])
      } else if (nextView === 'expenses') {
        const { data, error } = await supabase.from('expenses').select('amount,expense_date').eq('store_id', storeId).order('expense_date', { ascending: false }).limit(200)
        if (error) throw error
        setModuleRows((data ?? []) as Record<string, unknown>[])
      } else if (nextView === 'atelier') {
        const { data, error } = await supabase.from('atelier_productions').select('id,production_number,production_date,supplier_name_snapshot,fabric_name,fabric_number,fabric_quantity_m,total_quantity,total_cost,total_sales_price,gross_profit,margin_percent').eq('store_id', storeId).order('production_number', { ascending: false }).limit(200)
        if (error) throw error
        setModuleRows((data ?? []) as Record<string, unknown>[])
      } else if (nextView === 'deliveries') {
        const { data, error } = await supabase.from('deliveries').select('id,delivery_number,status,recipient_name,recipient_phone,delivery_address,created_at').eq('store_id', storeId).order('created_at', { ascending: false }).limit(200)
        if (error) throw error
        setModuleRows((data ?? []) as Record<string, unknown>[])
      } else if (nextView === 'promotions') {
        const { data, error } = await supabase.from('promotions').select('id,name,description,discount_type,discount_value,start_at,end_at,is_active,created_at').eq('store_id', storeId).order('created_at', { ascending: false }).limit(200)
        if (error) throw error
        setModuleRows((data ?? []) as Record<string, unknown>[])
      } else if (nextView === 'labels') {
        const { data, error } = await supabase.from('product_variants').select('id,product_id,sku,barcode,qr_token,size,color,sale_price,active').eq('store_id', storeId).eq('active', true).order('sku').limit(500)
        if (error) throw error
        setModuleRows((data ?? []) as Record<string, unknown>[])
      } else if (nextView === 'users') {
        const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'list', store_id: storeId } })
        if (error) throw error
        if (data?.error) throw new Error(data.error)
        setUserMembers((data?.members ?? []) as Record<string, unknown>[])
        setModuleRows([])
      }
      setView(nextView)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger ce module.')
      setView(nextView)
    } finally { setModuleLoading(false) }
  }

  async function changeMobileUserRole(member: Record<string, unknown>) {
    const roles = ['cashier', 'manager', 'stock_manager', 'admin']
    const current = String(member.role || 'cashier')
    const next = roles[(roles.indexOf(current) + 1) % roles.length]
    Alert.alert('Modifier le rôle', `Attribuer le rôle ${next} à ${String(member.email || member.full_name || 'cet utilisateur')} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', onPress: () => { void (async () => {
        try {
          const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'update_role', store_id: storeId, user_id: member.user_id, role: next } })
          if (error) throw error
          if (data?.error) throw new Error(data.error)
          await loadModule('users')
        } catch (e) { setError(e instanceof Error ? e.message : 'Modification du rôle impossible.') }
      })() } }
    ])
  }

  async function toggleMobileUser(member: Record<string, unknown>) {
    const nextActive = member.is_active === false
    Alert.alert(nextActive ? 'Activer le compte' : 'Désactiver le compte', `Confirmer cette modification pour ${String(member.email || member.full_name || 'cet utilisateur')} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Confirmer', style: nextActive ? 'default' : 'destructive', onPress: () => { void (async () => {
        try {
          const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'set_active', store_id: storeId, user_id: member.user_id, active: nextActive } })
          if (error) throw error
          if (data?.error) throw new Error(data.error)
          await loadModule('users')
        } catch (e) { setError(e instanceof Error ? e.message : 'Modification du statut impossible.') }
      })() } }
    ])
  }

  async function createMobileUser() {
    if (!newUserName.trim() || !newUserEmail.trim() || newUserPassword.length < 8) {
      Alert.alert('Vérification', 'Renseigne le nom, l’e-mail et un mot de passe de 8 caractères minimum.')
      return
    }
    setUserSaving(true); setError('')
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'create', store_id: storeId, full_name: newUserName.trim(), email: newUserEmail.trim(), password: newUserPassword, role: newUserRole } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setNewUserName(''); setNewUserEmail(''); setNewUserPassword('')
      await loadModule('users')
      Alert.alert('Utilisateur créé', 'Le compte a été créé et associé à la boutique.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Création impossible.') }
    finally { setUserSaving(false) }
  }

  async function signIn() {
    if (!email.trim() || !password) {
      setError('Saisis ton e-mail et ton mot de passe.')
      return
    }

    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) setError(error.message)
    setLoading(false)
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) Alert.alert('Erreur', error.message)
  }

  // STYLEPRO_SCANNER_ADDED
  async function openScanner() {
    setScanResult(null)
    setScanMessage('')
    setScanLocked(false)

    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission()
      if (!permission.granted) {
        Alert.alert(
          'Caméra non autorisée',
          'La caméra est désactivée. Tu peux quand même utiliser une douchette USB ou Bluetooth dans le champ de saisie.'
        )
      }
    }

    // L'ouverture du scanner ne dépend pas de l'autorisation caméra :
    // les douchettes HID USB/Bluetooth fonctionnent via le champ de saisie.
    setScannerOpen(true)
  }

  async function handleBarcodeScanned(result: { data: string }, fromHardwareScanner = false) {
    if ((!fromHardwareScanner && scanLocked) || scannerLoading) return
    const code = result.data?.trim()
    if (!code || !storeId) {
      setScanMessage(!storeId ? 'Sélectionne d’abord une boutique.' : 'Code vide.')
      setScanLocked(true)
      return
    }

    setScanLocked(true)
    setScannerLoading(true)
    setScanResult(null)
    setScanMessage(isOnline ? 'Recherche du produit…' : 'Recherche dans le catalogue local…')

    let scanEventQueued = false
    const scanEventId = createLocalUuid()
    try {
      await enqueueMobileSyncOperation({
        storeId,
        operation: 'scanner_event',
        idempotencyKey: scanEventId,
        dedupeKey: `scanner-event:${scanEventId}`,
        payload: { scanned_code: code, scanned_at: new Date().toISOString(), scanned_by: user?.id || '' },
      })
      scanEventQueued = true
    } catch {
      // Product lookup must remain available even if local event storage fails.
    }

    const showCachedResult = async () => {
      const cached = await findCachedScannerVariant(storeId, code)
      if (!cached) return false
      setScanResult({
        code, name: cached.product_name || 'Produit sans nom',
        sku: cached.sku || 'Sans référence', size: cached.size || 'Non renseigné',
        color: cached.color || 'Non renseignée', price: Number(cached.sale_price ?? 0),
        stock: cached.current_stock,
      })
      setScanMessage(language === 'ar'
        ? 'نتيجة من قاعدة البيانات المحلية · آخر مزامنة: ' + (mobileCacheSyncedAt ? dateLabel(mobileCacheSyncedAt) : 'غير متوفر')
        : 'Résultat du cache local · Dernière synchro : ' + (mobileCacheSyncedAt ? dateLabel(mobileCacheSyncedAt) : 'non disponible'))
      return true
    }

    try {
      if (!isOnline) {
        const found = await showCachedResult()
        if (!found) setScanMessage(language === 'ar'
          ? 'هذا الرمز غير موجود في الكتالوج المحلي. اتصل بالإنترنت لمزامنة المنتجات.'
          : 'Code absent du cache local. Connecte-toi pour synchroniser le catalogue.')
        return
      }

      const barcodeLookup = await supabase.from('product_variants')
        .select('id,product_id,sku,barcode,qr_token,size,color,sale_price,active')
        .eq('store_id', storeId).eq('active', true).eq('barcode', code).maybeSingle()
      if (barcodeLookup.error) throw barcodeLookup.error

      let variant = barcodeLookup.data
      if (!variant) {
        const qrLookup = await supabase.from('product_variants')
          .select('id,product_id,sku,barcode,qr_token,size,color,sale_price,active')
          .eq('store_id', storeId).eq('active', true).eq('qr_token', code).maybeSingle()
        if (qrLookup.error) throw qrLookup.error
        variant = qrLookup.data
      }
      if (!variant) {
        const skuLookup = await supabase.from('product_variants')
          .select('id,product_id,sku,barcode,qr_token,size,color,sale_price,active')
          .eq('store_id', storeId).eq('active', true).eq('sku', code).maybeSingle()
        if (skuLookup.error) throw skuLookup.error
        variant = skuLookup.data
      }
      if (!variant) {
        setScanMessage(`Aucun produit trouvé pour le code : ${code}`)
        return
      }

      const [productLookup, movementLookup] = await Promise.all([
        supabase.from('products').select('id,name')
          .eq('store_id', storeId).eq('id', variant.product_id).maybeSingle(),
        supabase.from('stock_movements').select('quantity_delta')
          .eq('store_id', storeId).eq('variant_id', variant.id),
      ])
      if (productLookup.error) throw productLookup.error

      let stock: number | null = null
      if (!movementLookup.error) {
        stock = (movementLookup.data ?? []).reduce(
          (sum: number, movement: { quantity_delta: number | string | null }) =>
            sum + Number(movement.quantity_delta ?? 0), 0,
        )
      }
      const productName = productLookup.data?.name || 'Produit sans nom'
      await upsertScannerVariant({
        id: variant.id, store_id: storeId, product_id: variant.product_id,
        sku: variant.sku, barcode: variant.barcode, qr_token: variant.qr_token,
        size: variant.size, color: variant.color, sale_price: Number(variant.sale_price ?? 0),
        active: variant.active, product_name: productName, current_stock: stock,
      })
      setScanResult({
        code, name: productName, sku: variant.sku || 'Sans référence',
        size: variant.size || 'Non renseigné', color: variant.color || 'Non renseignée',
        price: Number(variant.sale_price ?? 0), stock,
      })
      setScanMessage(scanEventQueued ? '' : (language === 'ar' ? 'تم العثور على المنتج، لكن تعذر حفظ سجل المسح محلياً.' : 'Produit trouvé, mais le journal de scan n’a pas pu être enregistré localement.'))
    } catch (e) {
      const usedCache = await showCachedResult().catch(() => false)
      if (!usedCache) {
        setScanMessage(e instanceof Error
          ? `Erreur de recherche : ${e.message}`
          : 'Erreur pendant la recherche du produit.')
      }
    } finally {
      setScannerLoading(false)
    }
  }

  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodStart = period === 'month' ? monthStart : period === 'custom' && customStart ? new Date(customStart + 'T00:00:00') : (() => { const d=new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate()-(period==='30d'?29:6)); return d })()
  const periodEnd = period === 'custom' && customEnd ? new Date(customEnd + 'T23:59:59.999') : now
  const inPeriod = (value: string) => { const d=new Date(value); return !Number.isNaN(d.getTime()) && d>=periodStart && d<=periodEnd }
  const periodSales = sales.filter(sale => inPeriod(sale.completed_at || sale.created_at))
  const periodReturns = returns.filter(row => inPeriod(row.created_at))
  const periodExpenses = expenses.filter(row => inPeriod(row.expense_date + 'T12:00:00'))
  const periodGross = periodSales.reduce((sum,row)=>sum+Number(row.total||0),0)
  const periodReturnTotal = periodReturns.reduce((sum,row)=>sum+Number(row.total||0),0)
  const periodNet = periodGross-periodReturnTotal
  const periodExpenseTotal = periodExpenses.reduce((sum,row)=>sum+Number(row.amount||0),0)

  const completedAt = (sale: SaleRow) =>
    new Date(sale.completed_at || sale.created_at)

  const todaySales = sales.filter(sale => completedAt(sale) >= dayStart)
  const monthSales = sales.filter(sale => completedAt(sale) >= monthStart)

  const todayIds = new Set(todaySales.map(sale => sale.id))
  const monthIds = new Set(monthSales.map(sale => sale.id))

  const todayReturns = returns
    .filter(row => new Date(row.created_at) >= dayStart && todayIds.has(row.sale_id))
    .reduce<number>((sum, row) => sum + Number(row.total || 0), 0)

  const monthReturns = returns
    .filter(row => new Date(row.created_at) >= monthStart && monthIds.has(row.sale_id))
    .reduce((sum, row) => sum + Number(row.total || 0), 0)

  const todayGross = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const monthGross = monthSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)

  const todayNet = todayGross - todayReturns
  const monthNet = monthGross - monthReturns

  const monthExpenses = expenses
    .filter(row => {
      const date = new Date(`${row.expense_date}T00:00:00`)
      return date >= monthStart && date <= now
    })
    .reduce((sum, row) => sum + Number(row.amount || 0), 0)

  const chartDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (6 - index))

    const next = new Date(date)
    next.setDate(next.getDate() + 1)

    const total = sales
      .filter(sale => {
        const dateOfSale = completedAt(sale)
        return dateOfSale >= date && dateOfSale < next
      })
      .reduce((sum, sale) => sum + Number(sale.total || 0), 0)

    return {
      date,
      total,
      label: date.toLocaleDateString('fr-DZ', { weekday: 'short' }).replace('.', ''),
    }
  })

  const maxChartValue = Math.max(...chartDays.map(day => day.total), 1)

  async function changeLanguage(next: 'fr'|'ar') {
    setLanguage(next)
    try { await AsyncStorage.setItem('stylepro.mobile.language', next) } catch { /* Keep current selection in memory. */ }
  }

  useEffect(() => {
    AsyncStorage.getItem('stylepro.mobile.language').then(saved => {
      if (saved === 'fr' || saved === 'ar') setLanguage(saved)
    }).catch(() => undefined)
  }, [])

  async function exportDashboardPdf() {
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => {
        const entities: Record<string,string> = {'&':'&amp;','<':'&lt;','>':'&gt;'}
        if (char === String.fromCharCode(34)) return '&quot;'
        if (char === String.fromCharCode(39)) return '&#39;'
        return entities[char] || char
      })
      const rtl = language === 'ar'
      const title = rtl ? 'تقرير المبيعات' : 'Rapport des ventes'
      const rows = periodSales.map(sale => '<tr><td>#' + esc(sale.sale_number) + '</td><td>' + esc(dateLabel(sale.completed_at || sale.created_at)) + '</td><td>' + esc(money(Number(sale.total || 0), currency)) + '</td></tr>').join('')
      const html = '<!doctype html><html lang="' + language + '" dir="' + (rtl ? 'rtl' : 'ltr') + '"><meta charset="utf-8"><style>@page{margin:16mm}body{font-family:Arial,sans-serif;color:#263243;font-size:12px}h1{color:#202c3c;border-bottom:3px solid #b58a52;padding-bottom:10px}.meta{background:#f1ebdd;padding:12px;margin:14px 0}.cards{display:flex;gap:9px}.card{flex:1;border:1px solid #d8cdbb;padding:12px;background:#fffcf6}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{padding:9px;border:1px solid #ded6c6;text-align:start}th{background:#202c3c;color:white}</style><body><h1>STYLEPRO MANAGER — ' + title + '</h1>' +
        '<div class="meta">' + (rtl ? 'المتجر' : 'Boutique') + ' : ' + esc(currentStore?.name || '') + '<br>' + (rtl ? 'الفترة' : 'Période') + ' : ' + esc(periodStart.toLocaleDateString(rtl ? 'ar-DZ' : 'fr-DZ')) + ' — ' + esc(periodEnd.toLocaleDateString(rtl ? 'ar-DZ' : 'fr-DZ')) + '</div>' +
        '<div class="cards"><div class="card"><b>' + (rtl ? 'إجمالي المبيعات' : 'Ventes brutes') + '</b><br>' + esc(money(periodGross,currency)) + '</div><div class="card"><b>' + (rtl ? 'المرتجعات' : 'Retours') + '</b><br>' + esc(money(periodReturnTotal,currency)) + '</div><div class="card"><b>' + (rtl ? 'صافي المبيعات' : 'Ventes nettes') + '</b><br>' + esc(money(periodNet,currency)) + '</div><div class="card"><b>' + (rtl ? 'المصاريف' : 'Dépenses') + '</b><br>' + esc(money(periodExpenseTotal,currency)) + '</div></div>' +
        '<table><thead><tr><th>' + (rtl ? 'الفاتورة' : 'Facture') + '</th><th>' + (rtl ? 'التاريخ' : 'Date') + '</th><th>' + (rtl ? 'المبلغ' : 'Montant') + '</th></tr></thead><tbody>' + (rows || '<tr><td colspan="3">' + (rtl ? 'لا توجد مبيعات خلال هذه الفترة' : 'Aucune vente sur cette période') + '</td></tr>') + '</tbody></table></body></html>'
      const file = await Print.printToFileAsync({ html })
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType:'application/pdf', dialogTitle:title })
      else await Print.printAsync({ html })
      Alert.alert(title, t('Rapport PDF prêt à partager.'))
    } catch (error) {
      Alert.alert(t('Impossible de générer le PDF'), error instanceof Error ? error.message : 'PDF error')
    } finally { setPdfBusy(false) }
  }

  if (!ready) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.muted}>Chargement de StylePro...</Text>
      </SafeAreaView>
    )
  }

  if (!user) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} translucent={false} />
        <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} contentContainerStyle={[styles.loginContainer, { paddingHorizontal: compactScreen ? 14 : 24 }]}>
          <View style={styles.logo}>
            <StoreIcon color={COLORS.surface} size={30} />
          </View>
          <Text style={styles.brand}>STYLEPRO</Text>
          <Text style={styles.heading}>Gestion de votre boutique</Text>
          <Text style={styles.subtitle}>
            Stock, produits et ventes au même endroit.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Adresse e-mail</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="nom@exemple.com"
              placeholderTextColor={COLORS.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              blurOnSubmit
              style={styles.input}
            />

            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Votre mot de passe"
              placeholderTextColor={COLORS.muted}
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={() => void signIn()}
              style={styles.input}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabledButton]}
              onPress={signIn}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <LogIn color="#FFFFFF" size={19} />
                  <Text style={styles.primaryButtonText}>Se connecter</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            StylePro Manager · Gestion commerciale
          </Text>
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} translucent={false} />
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentContainerStyle={[styles.content, { paddingHorizontal: compactScreen ? 12 : 18 }, language === 'ar' ? {direction:'rtl'} : null]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refreshAll(true)}
            tintColor={COLORS.accent}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>STYLEPRO</Text>
            <Text style={styles.subtitle}>{t('MANAGER · ESPACE COMMERCIAL')}</Text>
            <Text style={{ fontSize: 10, fontWeight: '800', marginTop: 4, color: isOnline ? COLORS.green : COLORS.danger }}>
              {isOnline
                ? (language === 'ar' ? 'متصل · مزامنة نشطة' : 'En ligne · Synchronisation active')
                : (language === 'ar' ? 'غير متصل · وضع محلي' : 'Hors ligne · Mode local')}
              {'  ·  '}{user && storeId ? mobileCacheCount : 0} {language === 'ar' ? 'منتج محفوظ' : 'articles en cache'}
              {'  ·  '}{user && storeId ? mobileQueuePending : 0} {language === 'ar' ? 'قيد المزامنة' : 'en attente'}
              {user && storeId && mobileQueueErrors > 0 ? ' · ' + mobileQueueErrors + (language === 'ar' ? ' أخطاء' : ' erreurs') : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <TouchableOpacity onPress={() => void changeLanguage(language === 'fr' ? 'ar' : 'fr')} style={styles.languageButton}><Text style={styles.languageButtonText}>{language === 'fr' ? 'عربي' : 'FR'}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => void openNotifications()} style={styles.iconButton} accessibilityLabel="Notifications">
              <Bell size={20} color={COLORS.navy} />
              {unreadNotifications.length > 0 ? <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>{unreadNotifications.length > 99 ? '99+' : unreadNotifications.length}</Text></View> : null}
            </TouchableOpacity>
            <TouchableOpacity onPress={signOut} style={styles.iconButton}>
              <LogOut size={20} color={COLORS.navy} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.welcome}>
          <Text style={styles.eyebrow}>{t('TABLEAU DE BORD')}</Text>
          <Text style={styles.welcomeTitle}>{t('Bonjour 👋')}</Text>
          <Text style={styles.welcomeEmail}>{user.email ?? 'Utilisateur connecté'}</Text>

          <TouchableOpacity
            style={styles.storeSelector}
            onPress={() => setStorePickerOpen(value => !value)}
          >
            <StoreIcon size={19} color="#FFFFFF" />
            <View style={styles.storeSelectorText}>
              <Text style={styles.storeSelectorLabel}>{t('Boutique sélectionnée')}</Text>
              <Text style={styles.storeSelectorName}>
                {currentStore?.name || t('Aucune boutique accessible')}
              </Text>
            </View>
            <ChevronDown size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => void openScanner()}
          style={{
            marginTop: 14,
            minHeight: 52,
            borderRadius: 14,
            backgroundColor: COLORS.navy,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <ScanLine size={21} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>
            {t('Scanner QR / Code-barres')}
          </Text>
        </TouchableOpacity>

        {storePickerOpen && (
          <View style={styles.storePicker}>
            {stores.map(store => (
              <TouchableOpacity
                key={store.id}
                style={[
                  styles.storeOption,
                  store.id === storeId && styles.storeOptionSelected,
                ]}
                onPress={() => {
                  setStoreId(store.id)
                  setView('dashboard')
                  setStorePickerOpen(false)
                }}
              >
                <StoreIcon size={18} color={COLORS.accent} />
                <View style={styles.flex}>
                  <Text style={styles.storeName}>{store.name}</Text>
                  <Text style={styles.subtitle}>{store.currency}</Text>
                </View>
                {store.id === storeId && (
                  <CheckCircle2 size={19} color={COLORS.green} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {error ? <View style={styles.errorBanner}><AlertTriangle size={19} color={COLORS.danger}/><Text style={styles.errorBannerText}>{error}</Text></View> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moduleNav}>
          {([
            ['dashboard', 'Accueil'], ['products', 'Catalogue'], ['sales', 'Ventes'], ['stock', 'Stock'],
            ['returns', 'Retours'], ['clients', 'Clients'], ['expenses', 'Dépenses'],
            ['atelier', 'Atelier'], ['deliveries', 'Livraisons'], ['promotions', 'Promos'], ['labels', 'Étiquettes'], ['users', 'Utilisateurs'], ['settings', 'Paramètres']
          ] as [typeof view, string][]).filter(([key]) => key !== 'users' && canViewMobileModule(key)).map(([key, label]) => (
            <TouchableOpacity key={key} onPress={() => void loadModule(key)} style={[styles.moduleNavItem, view === key && styles.moduleNavItemActive]}>
              <Text style={[styles.moduleNavText, view === key && styles.moduleNavTextActive]}>{t(label)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {view === 'dashboard' ? (
        <>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>{t('Performance commerciale')}</Text>
            <Text style={styles.sectionSubtitle}>{t('Les chiffres de votre boutique')}</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => void refreshAll(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw size={17} color={COLORS.navy} />
          </TouchableOpacity>
        </View>

        <View style={styles.periodPanel}>
          <Text style={styles.periodTitle}>{t('Période')}</Text>
          <View style={styles.periodChips}>
            {([['7d','7 derniers jours'],['30d','30 derniers jours'],['month','Ce mois'],['custom','Personnalisée']] as const).map(([key,label]) => (
              <TouchableOpacity key={key} onPress={() => setPeriod(key)} style={[styles.periodChip,period === key && styles.periodChipActive]}>
                <Text style={[styles.periodChipText,period === key && styles.periodChipTextActive]}>{t(label)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {period === 'custom' ? <View style={styles.dateFilterRow}>
            <TextInput value={customStart} onChangeText={setCustomStart} keyboardType="numbers-and-punctuation" placeholder={t('Du (AAAA-MM-JJ)')} placeholderTextColor={COLORS.muted} style={[styles.input,styles.dateFilterInput]} />
            <TextInput value={customEnd} onChangeText={setCustomEnd} keyboardType="numbers-and-punctuation" placeholder={t('Au (AAAA-MM-JJ)')} placeholderTextColor={COLORS.muted} style={[styles.input,styles.dateFilterInput]} />
          </View> : null}
          <View style={styles.periodSummary}>
            <View style={{flex:1,gap:4}}>
              <Text style={styles.periodSummaryText}>{periodSales.length} {t('Ventes')} · {money(periodNet,currency)}</Text>
              <Text style={styles.periodDetailText}>{t('Ventes brutes')}: {money(periodGross,currency)}</Text>
              <Text style={styles.periodDetailText}>{t('Retours')}: {money(periodReturnTotal,currency)} · {t('Dépenses')}: {money(periodExpenseTotal,currency)}</Text>
            </View>
            <TouchableOpacity style={styles.pdfButton} onPress={() => void exportDashboardPdf()} disabled={pdfBusy}>
              {pdfBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.pdfButtonText}>{t('Rapport PDF')}</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {loading && !refreshing && (
          <View style={styles.loadingLine}>
            <ActivityIndicator color={COLORS.accent} />
            <Text style={styles.muted}>Actualisation des données...</Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorBanner}>
            <AlertTriangle size={19} color={COLORS.danger} />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {!storeId && !loading ? (
          <View style={styles.card}>
            <Text style={styles.body}>
              Aucune boutique accessible avec ce compte. Vérifie les droits d'accès dans Supabase.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.metricGrid}>
              <MetricCard
                title={t("Ventes nettes aujourd'hui")}
                value={money(todayNet, currency)}
                detail={`${todaySales.length} facture(s), retours déduits`}
                icon={<TrendingUp size={21} />}
                tone="green"
              />
              <MetricCard
                title={t('Ventes nettes du mois')}
                value={money(monthNet, currency)}
                detail={`${monthSales.length} facture(s), retours déduits`}
                icon={<ShoppingBag size={21} />}
                tone="blue"
              />
              <MetricCard
                title={t('Panier moyen du mois')}
                value={money(monthSales.length ? monthGross / monthSales.length : 0, currency)}
                detail="Avant déduction des retours"
                icon={<Wallet size={21} />}
                tone="gold"
              />
              <MetricCard
                title={t('Dépenses du mois')}
                value={money(monthExpenses, currency)}
                detail="Dépenses enregistrées"
                icon={<CalendarDays size={21} />}
                tone="red"
              />
              <MetricCard
                title={t('Valeur du stock')}
                value={money(stockValue, currency)}
                detail={`${totalStockUnits.toLocaleString('fr-DZ')} unité(s), coût d'achat`}
                icon={<Package size={21} />}
                tone="gold"
              />
              <MetricCard
                title={t('Stock faible')}
                value={String(lowStock.length)}
                detail="Variantes au seuil minimum ou en dessous"
                icon={<AlertTriangle size={21} />}
                tone={lowStock.length ? 'red' : 'green'}
              />
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeadingIcon}>
                  <BarChart3 size={21} color={COLORS.accent} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.panelTitle}>{t('Évolution des ventes')}</Text>
                  <Text style={styles.panelSubtitle}>{t('7 derniers jours')} · avant retours</Text>
                </View>
              </View>

              <View style={styles.chart}>
                {chartDays.map(day => {
                  const height = day.total > 0
                    ? Math.max(8, (day.total / maxChartValue) * 116)
                    : 4

                  return (
                    <View key={day.date.toISOString()} style={styles.chartColumn}>
                      <Text style={styles.chartValue}>
                        {day.total > 0 ? day.total.toLocaleString('fr-DZ', {
                          maximumFractionDigits: 0,
                        }) : '—'}
                      </Text>
                      <View style={styles.chartBarArea}>
                        <View style={[styles.chartBar, { height }]} />
                      </View>
                      <Text style={styles.chartLabel}>{day.label}</Text>
                    </View>
                  )
                })}
              </View>
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeadingIcon}>
                  <ShoppingBag size={21} color={COLORS.accent} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.panelTitle}>{t('Ventes récentes')}</Text>
                  <Text style={styles.panelSubtitle}>{t('Dernières factures complétées')}</Text>
                </View>
                <Text style={styles.counter}>{sales.length}</Text>
              </View>

              {periodSales.slice(0, 8).length === 0 ? (
                <View style={styles.emptyState}>
                  <ShoppingBag size={27} color={COLORS.muted} />
                  <Text style={styles.emptyTitle}>{t('Aucune vente complétée')}</Text>
                  <Text style={styles.emptyText}>
                    {t('Les factures terminées apparaîtront ici.')}
                  </Text>
                </View>
              ) : (
                periodSales.slice(0, 8).map(sale => (
                  <View key={sale.id} style={styles.saleRow}>
                    <View style={styles.saleIcon}>
                      <ShoppingBag size={18} color={COLORS.navy} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.saleNumber}>Facture #{sale.sale_number}</Text>
                      <Text style={styles.saleDate}>
                        {dateLabel(sale.completed_at || sale.created_at)}
                      </Text>
                    </View>
                    <View style={styles.saleAmountBox}>
                      <Text style={styles.saleAmount}>
                        {money(Number(sale.total || 0), currency)}
                      </Text>
                      <Text style={styles.completedStatus}>Complétée</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={[styles.panelHeadingIcon, { backgroundColor: COLORS.paleRed }]}>
                  <AlertTriangle size={21} color={COLORS.danger} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.panelTitle}>{t('Alertes de stock')}</Text>
                  <Text style={styles.panelSubtitle}>Seuil minimum configuré par variante</Text>
                </View>
                <Text style={styles.counter}>{lowStock.length}</Text>
              </View>

              {lowStock.length === 0 ? (
                <View style={styles.emptyState}>
                  <CheckCircle2 size={27} color={COLORS.green} />
                  <Text style={styles.emptyTitle}>Aucune alerte selon les seuils configurés</Text>
                  <Text style={styles.emptyText}>
                    Les variantes avec un minimum défini seront suivies ici.
                  </Text>
                </View>
              ) : (
                lowStock.slice(0, 12).map(row => (
                  <View key={row.id} style={styles.stockRow}>
                    <View style={styles.stockIcon}>
                      <Package size={19} color={COLORS.danger} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.saleNumber}>{row.sku}</Text>
                      <Text style={styles.saleDate}>Minimum : {row.minimum}</Text>
                    </View>
                    <View style={styles.stockQuantityBox}>
                      <Text style={styles.stockQuantity}>{row.current}</Text>
                      <Text style={styles.stockQuantityLabel}>En stock</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeadingIcon}>
                  <Package size={21} color={COLORS.accent} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.panelTitle}>Catalogue produits</Text>
                  <Text style={styles.panelSubtitle}>
                    {products.filter(product => product.active).length} actif(s) sur {products.length}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => void loadModule('products')}
                >
                  <Text style={styles.smallButtonText}>Ouvrir</Text>
                </TouchableOpacity>
              </View>

              {products.length === 0 && (
                <View style={styles.emptyState}>
                  <Package size={26} color={COLORS.muted} />
                  <Text style={styles.emptyText}>Aucun produit dans ce catalogue.</Text>
                </View>
              )}
              {products.map(product => (
                <View key={product.id} style={styles.productRow}>
                  <View style={styles.productIcon}>
                    <Package size={20} color={COLORS.navy} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.saleNumber}>{product.name}</Text>
                    <Text style={styles.saleDate}>
                      {product.target_audience || 'Catégorie non renseignée'}
                    </Text>
                  </View>
                  <Text style={product.active ? styles.active : styles.inactive}>
                    {product.active ? 'Actif' : 'Inactif'}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.disclaimer}>
              Les statistiques utilisent les données enregistrées dans cette boutique.
              Les ventes sont basées sur les factures complétées. La valeur du stock
              utilise le coût d'achat des variantes. Les dépenses ne représentent pas
              à elles seules le bénéfice net comptable.
            </Text>
          </>
        )}

        </>
        ) : view === 'settings' ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{t('Paramètres de l’application')}</Text>
            <Text style={styles.panelSubtitle}>{t('Langue')}</Text>
            <View style={styles.periodChips}>
              <TouchableOpacity onPress={() => void changeLanguage('fr')} style={[styles.periodChip,language === 'fr' && styles.periodChipActive]}><Text style={[styles.periodChipText,language === 'fr' && styles.periodChipTextActive]}>{t('Français')}</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => void changeLanguage('ar')} style={[styles.periodChip,language === 'ar' && styles.periodChipActive]}><Text style={[styles.periodChipText,language === 'ar' && styles.periodChipTextActive]}>{t('العربية')}</Text></TouchableOpacity>
            </View>
            <Text style={styles.panelSubtitle}>Informations de la session active</Text>
            <View style={styles.moduleDataRow}><Text style={styles.moduleDataLabel}>Utilisateur</Text><Text style={styles.moduleDataValue}>{user.email || '—'}</Text></View>
            <View style={styles.moduleDataRow}><Text style={styles.moduleDataLabel}>Boutique</Text><Text style={styles.moduleDataValue}>{currentStore?.name || '—'}</Text></View>
            <View style={styles.moduleDataRow}><Text style={styles.moduleDataLabel}>Devise</Text><Text style={styles.moduleDataValue}>{currency}</Text></View>
            <TouchableOpacity style={styles.primaryButton} onPress={() => void refreshAll(true)}><RefreshCw size={17} color="#FFFFFF"/><Text style={styles.primaryButtonText}>{t('Actualiser les données')}</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: COLORS.danger, marginTop: 10 }]} onPress={signOut}><LogOut size={17} color="#FFFFFF"/><Text style={styles.primaryButtonText}>{t('Déconnexion')}</Text></TouchableOpacity>
            <Text style={styles.disclaimer}>Les paramètres sensibles et les permissions sont gérés côté serveur via Supabase. Aucun réglage de sécurité n’est modifié depuis cet écran.</Text>
          </View>
        ) : view === 'users' ? (
          <View style={styles.panel}>
            <View style={styles.panelHeader}><View style={styles.flex}><Text style={styles.panelTitle}>Gestion des utilisateurs</Text><Text style={styles.panelSubtitle}>Comptes associés à cette boutique · accès administrateur requis</Text></View><TouchableOpacity style={styles.smallButton} onPress={() => void loadModule('users')}><Text style={styles.smallButtonText}>Actualiser</Text></TouchableOpacity></View>
            <TextInput style={styles.input} value={newUserName} onChangeText={setNewUserName} placeholder="Nom complet" placeholderTextColor={COLORS.muted}/>
            <TextInput style={styles.input} value={newUserEmail} onChangeText={setNewUserEmail} placeholder="Adresse e-mail" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={COLORS.muted}/>
            <TextInput style={styles.input} value={newUserPassword} onChangeText={setNewUserPassword} placeholder="Mot de passe temporaire (8 caractères min.)" secureTextEntry placeholderTextColor={COLORS.muted}/>
            <View style={styles.rolePicker}>{[['cashier','Caissier'],['manager','Manager'],['stock_manager','Gestionnaire stock'],['admin','Administrateur']].map(([value,label])=><TouchableOpacity key={value} onPress={() => setNewUserRole(value)} style={[styles.roleChip,newUserRole===value&&styles.roleChipActive]}><Text style={[styles.roleChipText,newUserRole===value&&styles.roleChipTextActive]}>{label}</Text></TouchableOpacity>)}</View>
            <TouchableOpacity style={[styles.primaryButton,userSaving&&styles.disabledButton]} onPress={() => void createMobileUser()} disabled={userSaving}><Text style={styles.primaryButtonText}>{userSaving ? 'Création…' : 'Créer un utilisateur'}</Text></TouchableOpacity>
            {moduleLoading ? <ActivityIndicator color={COLORS.accent} style={{ margin: 18 }}/> : userMembers.length === 0 ? <Text style={styles.emptyText}>Aucun membre affiché ou accès administrateur requis.</Text> : userMembers.map((member,index)=><View key={String(member.user_id||index)} style={styles.moduleDataRow}><View style={styles.flex}><Text style={styles.saleNumber}>{String(member.full_name||member.email||member.user_id||'Utilisateur')}</Text><Text style={styles.saleDate}>{String(member.email||'')} · {String(member.role||'')}</Text></View><View style={{ alignItems: 'flex-end', gap: 7 }}><Text style={member.is_active===false?styles.inactive:styles.active}>{member.is_active===false?'Inactif':'Actif'}</Text><View style={{ flexDirection: 'row', gap: 5 }}><TouchableOpacity style={styles.smallButton} onPress={() => void changeMobileUserRole(member)}><Text style={styles.smallButtonText}>Rôle</Text></TouchableOpacity><TouchableOpacity style={styles.smallButton} onPress={() => void toggleMobileUser(member)}><Text style={styles.smallButtonText}>{member.is_active===false?'Activer':'Désactiver'}</Text></TouchableOpacity></View></View></View>)}
          </View>
        ) : (
          <View style={styles.panel}>
            <View style={styles.panelHeader}><View style={styles.flex}><Text style={styles.panelTitle}>{moduleLabels[view] || 'Module'}</Text><Text style={styles.panelSubtitle}>Données de la boutique sélectionnée · lecture sécurisée</Text></View><TouchableOpacity style={styles.smallButton} onPress={() => void loadModule(view)}><Text style={styles.smallButtonText}>Actualiser</Text></TouchableOpacity></View>
            <TextInput value={moduleSearch} onChangeText={setModuleSearch} placeholder="Rechercher dans ce module…" placeholderTextColor={COLORS.muted} style={styles.input}/>
            {moduleLoading ? <ActivityIndicator color={COLORS.accent} style={{ margin: 20 }}/> : null}
            {!moduleLoading && moduleRows.length === 0 ? <View style={styles.emptyState}><Package size={26} color={COLORS.muted}/><Text style={styles.emptyTitle}>Aucune donnée à afficher</Text><Text style={styles.emptyText}>Les données apparaîtront ici lorsqu’elles seront enregistrées dans cette boutique.</Text></View> : null}
            {moduleRows.filter(row => JSON.stringify(row).toLowerCase().includes(moduleSearch.toLowerCase())).map((row,index) => {
              const title = String(row.name ?? row.product_name ?? row.full_name ?? (row.sale_number ? 'Facture #'+row.sale_number : row.delivery_number ? 'Livraison #'+row.delivery_number : row.production_number ? 'Production #'+row.production_number : row.sale_id ? 'Retour · Vente '+String(row.sale_id).slice(0,8) : row.expense_date ? 'Dépense · '+String(row.expense_date) : row.sku ?? row.id ?? 'Enregistrement'))
              const detail = [row.sku,row.phone,row.size,row.color,row.status,row.discount_type ? String(row.discount_value)+' '+String(row.discount_type) : null,row.start_at,row.end_at,row.barcode ? 'EAN '+String(row.barcode) : null,row.qr_token ? 'QR '+String(row.qr_token) : null,row.production_date,row.expense_date,row.created_at].filter(Boolean).map(String).join(' · ')
              const amount = row.total ?? row.total_sales_price ?? row.amount ?? row.sale_price ?? row.discount_value
              const quantity = row.current_stock ?? row.total_quantity
              const activeState = row.active ?? row.is_active
              const amountLabel = row.discount_type === 'percent' ? `${Number(row.discount_value || 0)}%` : amount !== undefined ? money(Number(amount),currency) : null
              return <View key={String(row.id ?? row.sale_id ?? index)} style={styles.moduleDataRow}><View style={styles.flex}><Text style={styles.saleNumber}>{title}</Text><Text style={styles.saleDate}>{detail || String(row.description ?? row.fabric_name ?? '')}</Text>{quantity !== undefined ? <Text style={styles.saleDate}>Quantité / stock : {String(quantity)}</Text> : null}</View><View style={{ alignItems: 'flex-end' }}>{amountLabel !== null ? <Text style={styles.saleAmount}>{amountLabel}</Text> : null}{activeState !== undefined ? <Text style={activeState?styles.active:styles.inactive}>{activeState?'Actif':'Inactif'}</Text> : null}</View></View>
            })}
          </View>
        )}
        <Text style={styles.footer}>STYLEPRO MANAGER · Gestion commerciale</Text>
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={notificationsOpen}
        animationType="slide"
        onRequestClose={() => setNotificationsOpen(false)}
      >
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.navy, fontSize: 23, fontWeight: '900' }}>Notifications</Text>
              <Text style={{ color: COLORS.muted, marginTop: 4 }}>Alertes automatiques de votre boutique</Text>
            </View>
            <TouchableOpacity onPress={() => setNotificationsOpen(false)} style={styles.iconButton}>
              <Text style={{ color: COLORS.navy, fontWeight: '800' }}>Fermer</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 0 }}>
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={[styles.panelHeadingIcon, { backgroundColor: COLORS.paleRed }]}>
                  <AlertTriangle size={20} color={COLORS.danger} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.panelTitle}>Stock faible ou critique</Text>
                  <Text style={styles.panelSubtitle}>{lowStock.length} alerte(s) détectée(s)</Text>
                </View>
              </View>
              {lowStock.length === 0 ? (
                <View style={styles.emptyState}>
                  <CheckCircle2 size={28} color={COLORS.green} />
                  <Text style={styles.emptyTitle}>Aucune notification active</Text>
                  <Text style={styles.emptyText}>Les alertes apparaîtront lorsqu'une variante atteint son stock minimum.</Text>
                </View>
              ) : lowStock.map(item => (
                <View key={item.id} style={styles.stockRow}>
                  <View style={styles.stockIcon}><AlertTriangle size={18} color={COLORS.danger} /></View>
                  <View style={styles.flex}>
                    <Text style={styles.saleNumber}>{item.sku}</Text>
                    <Text style={styles.saleDate}>Seuil minimum : {item.minimum}</Text>
                  </View>
                  <View style={styles.stockQuantityBox}>
                    <Text style={styles.stockQuantity}>{item.current}</Text>
                    <Text style={styles.stockQuantityLabel}>En stock</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeadingIcon}><ShoppingBag size={20} color={COLORS.accent}/></View>
                <View style={styles.flex}><Text style={styles.panelTitle}>Activité récente</Text><Text style={styles.panelSubtitle}>Dernières ventes et retours enregistrés</Text></View>
              </View>
              {sales.slice(0,5).map(sale => (
                <View key={sale.id} style={styles.saleRow}>
                  <View style={styles.saleIcon}><ShoppingBag size={17} color={COLORS.navy}/></View>
                  <View style={styles.flex}><Text style={styles.saleNumber}>Nouvelle vente · #{sale.sale_number}</Text><Text style={styles.saleDate}>{dateLabel(sale.completed_at || sale.created_at)}</Text></View>
                  <Text style={styles.saleAmount}>{money(Number(sale.total || 0),currency)}</Text>
                </View>
              ))}
              {returns.slice(0,5).map((item,index) => (
                <View key={item.sale_id+':'+index} style={styles.saleRow}>
                  <View style={styles.stockIcon}><RefreshCw size={17} color={COLORS.danger}/></View>
                  <View style={styles.flex}><Text style={styles.saleNumber}>Retour enregistré</Text><Text style={styles.saleDate}>{dateLabel(item.created_at)}</Text></View>
                  <Text style={styles.saleAmount}>{money(Number(item.total || 0),currency)}</Text>
                </View>
              ))}
              {sales.length === 0 && returns.length === 0 ? <Text style={styles.emptyText}>Aucune activité récente.</Text> : null}
            </View>
            <Text style={styles.disclaimer}>Les alertes sont générées à partir des ventes, retours et mouvements de stock enregistrés dans la boutique. Elles ne modifient aucune donnée.</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={{
            padding: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: COLORS.navy, fontSize: 22, fontWeight: '900' }}>
                Scanner produit
              </Text>
              <Text style={{ color: COLORS.muted, marginTop: 4 }}>
                {currentStore?.name || 'Boutique non sélectionnée'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setScannerOpen(false)}
              style={{
                backgroundColor: COLORS.surface,
                paddingHorizontal: 16,
                paddingVertical: 11,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.navy, fontWeight: '800' }}>Fermer</Text>
            </TouchableOpacity>
          </View>

          <View style={{ marginHorizontal: 18, marginBottom: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.text, fontWeight: '800', marginBottom: 7 }}>Douchette USB / Bluetooth</Text>
            <Text style={{ color: COLORS.muted, fontSize: 11, marginBottom: 9 }}>Connectez la douchette au téléphone. Scannez : le code est envoyé automatiquement avec Entrée.</Text>
            <TextInput
              value={hardwareScannerCode}
              onChangeText={setHardwareScannerCode}
              onSubmitEditing={() => {
                const code = hardwareScannerCode.trim()
                setHardwareScannerCode('')
                if (code) void handleBarcodeScanned({ data: code }, true)
              }}
              placeholder="Scannez ici avec la douchette…"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              blurOnSubmit={false}
              returnKeyType="done"
              style={[styles.input, { marginBottom: 0 }]}
            />
          </View>

          <View style={{
            marginHorizontal: 18,
            height: 300,
            overflow: 'hidden',
            borderRadius: 20,
            backgroundColor: '#101820',
          }}>
            {cameraPermission?.granted ? (
              <>
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{
                    barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'upc_a', 'upc_e', 'code39'],
                  }}
                  onBarcodeScanned={
                    scanLocked || scannerLoading || !storeId
                      ? undefined
                      : handleBarcodeScanned
                  }
                />
                <View pointerEvents="none" style={{
                  position: 'absolute',
                  top: '32%',
                  left: '10%',
                  right: '10%',
                  height: 105,
                  borderWidth: 2,
                  borderColor: '#D6B278',
                  borderRadius: 12,
                }} />
              </>
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <Text style={{ color: '#FFFFFF', textAlign: 'center', marginBottom: 12 }}>Caméra non autorisée. La douchette USB / Bluetooth reste disponible.</Text>
                <TouchableOpacity onPress={() => void requestCameraPermission()} style={{ backgroundColor: COLORS.accent, borderRadius: 12, padding: 12 }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Autoriser la caméra</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {scannerLoading ? (
            <View style={{ alignItems: 'center', padding: 18, gap: 8 }}>
              <ActivityIndicator color={COLORS.accent} size="large" />
              <Text style={{ color: COLORS.text }}>Recherche dans la boutique…</Text>
            </View>
          ) : null}

          {scanMessage ? (
            <View style={{
              margin: 18,
              padding: 15,
              borderRadius: 14,
              backgroundColor: COLORS.surface,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}>
              <Text style={{ color: COLORS.text, lineHeight: 22 }}>{scanMessage}</Text>
            </View>
          ) : null}

          {scanResult ? (
            <View style={{
              margin: 18,
              marginTop: 4,
              padding: 18,
              borderRadius: 18,
              backgroundColor: COLORS.surface,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}>
              <Text style={{ color: COLORS.accent, fontWeight: '900', fontSize: 12 }}>
                PRODUIT IDENTIFIÉ
              </Text>
              <Text style={{
                color: COLORS.navy,
                fontWeight: '900',
                fontSize: 21,
                marginTop: 8,
              }}>
                {scanResult.name}
              </Text>
              <Text style={{ color: COLORS.muted, marginTop: 8 }}>
                Référence : {scanResult.sku}
              </Text>
              <Text style={{ color: COLORS.muted, marginTop: 5 }}>
                Taille : {scanResult.size} · Couleur : {scanResult.color}
              </Text>
              <Text style={{
                color: COLORS.navy,
                fontWeight: '900',
                fontSize: 19,
                marginTop: 12,
              }}>
                {money(scanResult.price, currency)}
              </Text>
              <Text style={{ color: COLORS.text, marginTop: 6 }}>
                Stock : {scanResult.stock === null ? 'Indisponible' : scanResult.stock}
              </Text>
              <Text style={{ color: COLORS.muted, marginTop: 6, fontSize: 12 }}>
                Code scanné : {scanResult.code}
              </Text>
            </View>
          ) : null}

          <View style={{
            paddingHorizontal: 18,
            paddingTop: 4,
            flexDirection: 'row',
            gap: 10,
          }}>
            <TouchableOpacity
              onPress={() => {
                setScanResult(null)
                setScanMessage('')
                setScanLocked(false)
              }}
              style={{
                flex: 1,
                backgroundColor: COLORS.accent,
                borderRadius: 13,
                padding: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Scanner à nouveau</Text>
            </TouchableOpacity>
          </View>
          <Text style={{
            color: COLORS.muted,
            textAlign: 'center',
            padding: 16,
            fontSize: 12,
          }}>
            La lecture ne modifie pas le stock.
          </Text>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loginContainer: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: COLORS.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  brand: {
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 3,
  },
  heading: {
    color: COLORS.text,
    fontSize: 28,
    lineHeight: 35,
    fontWeight: '800',
    marginTop: 12,
  },
  subtitle: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 20,
    marginTop: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  label: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#F7F3EA',
    borderWidth: 1,
    borderColor: '#CFC3AE',
    borderRadius: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    textAlignVertical: 'center',
    color: COLORS.text,
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: COLORS.navy,
    borderRadius: 13,
    padding: 15,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  disabledButton: { opacity: 0.65 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  error: { color: COLORS.danger, marginTop: 12, fontSize: 13 },
  content: { paddingTop: 18, paddingBottom: 120 },
  languageButton:{minWidth:42,height:42,paddingHorizontal:9,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:COLORS.paleGold,borderWidth:1,borderColor:COLORS.border},
  languageButtonText:{color:COLORS.navy,fontSize:12,fontWeight:'900'},
  periodPanel:{backgroundColor:COLORS.surface,borderRadius:18,padding:14,marginBottom:16,borderWidth:1,borderColor:COLORS.border},
  periodTitle:{color:COLORS.navy,fontWeight:'900',fontSize:14,marginBottom:10},
  periodChips:{flexDirection:'row',flexWrap:'wrap',gap:7},
  periodChip:{paddingHorizontal:10,paddingVertical:9,borderRadius:10,borderWidth:1,borderColor:COLORS.border,backgroundColor:'#F7F3EA'},
  periodChipActive:{backgroundColor:COLORS.navy,borderColor:COLORS.navy},
  periodChipText:{color:COLORS.text,fontSize:10,fontWeight:'800'},
  periodChipTextActive:{color:'#FFFFFF'},
  dateFilterRow:{flexDirection:'row',gap:8,marginTop:10},
  dateFilterInput:{flex:1,minWidth:0,fontSize:11,paddingHorizontal:8},
  periodSummary:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:12,paddingTop:10,borderTopWidth:1,borderTopColor:COLORS.border},
  periodSummaryText:{color:COLORS.navy,fontSize:11,fontWeight:'800',flex:1},
  periodDetailText:{color:COLORS.muted,fontSize:10,fontWeight:'700'},
  pdfButton:{backgroundColor:COLORS.accent,borderRadius:10,paddingHorizontal:13,paddingVertical:10,minWidth:92,alignItems:'center'},
  pdfButtonText:{color:'#FFFFFF',fontSize:11,fontWeight:'900'},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  moduleNav: { gap: 8, paddingVertical: 6, paddingBottom: 14 },
  moduleNavItem: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  moduleNavItemActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  moduleNavText: { color: COLORS.text, fontSize: 11, fontWeight: '800' },
  moduleNavTextActive: { color: '#FFFFFF' },
  moduleDataRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderTopWidth: 1, borderTopColor: '#EEE7DA' },
  moduleDataLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  moduleDataValue: { color: COLORS.text, fontSize: 13, fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  rolePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  roleChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background },
  roleChipActive: { backgroundColor: COLORS.navy, borderColor: COLORS.navy },
  roleChipText: { color: COLORS.text, fontSize: 10, fontWeight: '700' },
  roleChipTextActive: { color: '#FFFFFF' },
  notificationBadge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.surface },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  iconButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 13,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  welcome: {
    backgroundColor: COLORS.navy,
    padding: 20,
    borderRadius: 22,
    marginBottom: 24,
  },
  eyebrow: {
    color: '#D8B987',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '900',
    marginBottom: 8,
  },
  welcomeTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '900' },
  welcomeEmail: { color: '#D8DEE6', fontSize: 12, marginTop: 5 },
  storeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 20,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#344254',
  },
  storeSelectorText: { flex: 1 },
  storeSelectorLabel: { color: '#D8DEE6', fontSize: 10 },
  storeSelectorName: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', marginTop: 3 },
  storePicker: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
    marginTop: -14,
    marginBottom: 22,
  },
  storeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
  },
  storeOptionSelected: { backgroundColor: '#F2E8D6' },
  storeName: { color: COLORS.text, fontWeight: '800', fontSize: 14 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: { color: COLORS.text, fontSize: 19, fontWeight: '900' },
  sectionSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loadingLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    width: '48%',
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 155,
    padding: 14,
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  metricTitle: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  metricValue: { color: COLORS.navy, fontSize: 18, fontWeight: '900', marginTop: 7 },
  metricDetail: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  panel: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginTop: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 16 },
  panelHeadingIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: COLORS.paleGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  panelSubtitle: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  counter: {
    color: COLORS.navy,
    fontSize: 13,
    fontWeight: '900',
    backgroundColor: '#F1EBDD',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    minHeight: 170,
    paddingTop: 10,
  },
  chartColumn: { flex: 1, alignItems: 'center', minWidth: 0 },
  chartValue: { color: COLORS.muted, fontSize: 9, marginBottom: 6 },
  chartBarArea: {
    height: 120,
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '100%',
  },
  chartBar: {
    width: 16,
    maxWidth: '70%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    backgroundColor: COLORS.accent,
  },
  chartLabel: { color: COLORS.muted, fontSize: 10, marginTop: 9 },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEE7DA',
  },
  saleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paleBlue,
  },
  flex: { flex: 1 },
  saleNumber: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  saleDate: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  saleAmountBox: { alignItems: 'flex-end', maxWidth: '45%' },
  saleAmount: { color: COLORS.navy, fontSize: 12, fontWeight: '900' },
  completedStatus: { color: COLORS.green, fontSize: 10, marginTop: 4 },
  emptyState: { alignItems: 'center', paddingVertical: 25, gap: 8 },
  emptyTitle: { color: COLORS.text, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: COLORS.muted, fontSize: 11, textAlign: 'center', lineHeight: 17 },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#EEE7DA',
  },
  stockIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.paleRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stockQuantityBox: { alignItems: 'flex-end' },
  stockQuantity: { color: COLORS.danger, fontSize: 19, fontWeight: '900' },
  stockQuantityLabel: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#EEE7DA',
  },
  productIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.paleGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { color: COLORS.green, fontSize: 11, fontWeight: '800' },
  inactive: { color: COLORS.danger, fontSize: 11, fontWeight: '800' },
  smallButton: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.paleGold,
  },
  smallButtonText: { color: COLORS.navy, fontSize: 11, fontWeight: '800' },
  errorBanner: {
    flexDirection: 'row',
    gap: 9,
    padding: 13,
    marginVertical: 10,
    backgroundColor: COLORS.paleRed,
    borderRadius: 12,
  },
  errorBannerText: { color: COLORS.danger, flex: 1, fontSize: 12, lineHeight: 18 },
  body: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
  muted: { color: COLORS.muted, fontSize: 12 },
  disclaimer: {
    color: COLORS.muted,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 18,
    paddingHorizontal: 3,
  },
  footer: {
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 24,
  },
})
