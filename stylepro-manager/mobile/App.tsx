import React, { useCallback, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
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
  image_url: string | null
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

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [stores, setStores] = useState<StoreRow[]>([])
  const [storeId, setStoreId] = useState('')
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
  const [view, setView] = useState<'dashboard' | 'products'>('dashboard')
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

  const currentStore = stores.find(store => store.id === storeId)
  const currency = currentStore?.currency || 'DZD'
  const notificationStorageKey = user && storeId ? `stylepro.notifications.read.${user.id}.${storeId}` : ''
  const unreadNotifications = lowStock.filter(item => !readNotificationIds.includes(item.id))

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
    const ids = lowStock.map(item => item.id)
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
      .select('id,name,target_audience,description,active,image_url')
      .eq('store_id', id)
      .order('name')

    if (error) throw new Error(`Catalogue : ${error.message}`)
    setProducts((data ?? []) as ProductRow[])
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les boutiques.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user, loadStores])

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
    setScanMessage('Recherche du produit…')

    try {
      // Recherche limitée à la boutique sélectionnée.
      const barcodeLookup = await supabase
        .from('product_variants')
        .select('id,product_id,sku,barcode,qr_token,size,color,sale_price,active')
        .eq('store_id', storeId)
        .eq('active', true)
        .eq('barcode', code)
        .maybeSingle()

      if (barcodeLookup.error) throw barcodeLookup.error

      let variant = barcodeLookup.data

      if (!variant) {
        const qrLookup = await supabase
          .from('product_variants')
          .select('id,product_id,sku,barcode,qr_token,size,color,sale_price,active')
          .eq('store_id', storeId)
          .eq('active', true)
          .eq('qr_token', code)
          .maybeSingle()

        if (qrLookup.error) throw qrLookup.error
        variant = qrLookup.data
      }

      if (!variant) {
        const skuLookup = await supabase
          .from('product_variants')
          .select('id,product_id,sku,barcode,qr_token,size,color,sale_price,active')
          .eq('store_id', storeId)
          .eq('active', true)
          .eq('sku', code)
          .maybeSingle()

        if (skuLookup.error) throw skuLookup.error
        variant = skuLookup.data
      }

      if (!variant) {
        setScanMessage(`Aucun produit trouvé pour le code : ${code}`)
        return
      }

      const [productLookup, movementLookup] = await Promise.all([
        supabase
          .from('products')
          .select('id,name')
          .eq('store_id', storeId)
          .eq('id', variant.product_id)
          .maybeSingle(),
        supabase
          .from('stock_movements')
          .select('quantity_delta')
          .eq('store_id', storeId)
          .eq('variant_id', variant.id),
      ])

      if (productLookup.error) throw productLookup.error

      // Stock indisponible si la lecture des mouvements échoue.
      let stock: number | null = null
      if (!movementLookup.error) {
        stock = (movementLookup.data ?? []).reduce(
          (sum: number, movement: { quantity_delta: number | string | null }) =>
            sum + Number(movement.quantity_delta ?? 0),
          0
        )
      }

      setScanResult({
        code,
        name: productLookup.data?.name || 'Produit sans nom',
        sku: variant.sku || 'Sans référence',
        size: variant.size || 'Non renseigné',
        color: variant.color || 'Non renseignée',
        price: Number(variant.sale_price ?? 0),
        stock,
      })
      setScanMessage('')
    } catch (e) {
      setScanMessage(
        e instanceof Error ? `Erreur de recherche : ${e.message}` : 'Erreur pendant la recherche du produit.'
      )
    } finally {
      setScannerLoading(false)
    }
  }

  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

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

  if (!ready) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.muted}>Chargement de StylePro...</Text>
      </SafeAreaView>
    )
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <ScrollView contentContainerStyle={styles.loginContainer}>
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
              style={styles.input}
            />

            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Votre mot de passe"
              placeholderTextColor={COLORS.muted}
              secureTextEntry
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
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.content}
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
            <Text style={styles.subtitle}>MANAGER · ESPACE COMMERCIAL</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
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
          <Text style={styles.eyebrow}>TABLEAU DE BORD</Text>
          <Text style={styles.welcomeTitle}>Bonjour 👋</Text>
          <Text style={styles.welcomeEmail}>{user.email ?? 'Utilisateur connecté'}</Text>

          <TouchableOpacity
            style={styles.storeSelector}
            onPress={() => setStorePickerOpen(value => !value)}
          >
            <StoreIcon size={19} color="#FFFFFF" />
            <View style={styles.storeSelectorText}>
              <Text style={styles.storeSelectorLabel}>Boutique sélectionnée</Text>
              <Text style={styles.storeSelectorName}>
                {currentStore?.name || 'Aucune boutique accessible'}
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
            Scanner QR / Code-barres
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

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Performance commerciale</Text>
            <Text style={styles.sectionSubtitle}>Les chiffres de votre boutique</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => void refreshAll(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw size={17} color={COLORS.navy} />
          </TouchableOpacity>
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
                title="Ventes nettes aujourd'hui"
                value={money(todayNet, currency)}
                detail={`${todaySales.length} facture(s), retours déduits`}
                icon={<TrendingUp size={21} />}
                tone="green"
              />
              <MetricCard
                title="Ventes nettes du mois"
                value={money(monthNet, currency)}
                detail={`${monthSales.length} facture(s), retours déduits`}
                icon={<ShoppingBag size={21} />}
                tone="blue"
              />
              <MetricCard
                title="Panier moyen du mois"
                value={money(monthSales.length ? monthGross / monthSales.length : 0, currency)}
                detail="Avant déduction des retours"
                icon={<Wallet size={21} />}
                tone="gold"
              />
              <MetricCard
                title="Dépenses du mois"
                value={money(monthExpenses, currency)}
                detail="Dépenses enregistrées"
                icon={<CalendarDays size={21} />}
                tone="red"
              />
              <MetricCard
                title="Valeur du stock"
                value={money(stockValue, currency)}
                detail={`${totalStockUnits.toLocaleString('fr-DZ')} unité(s), coût d'achat`}
                icon={<Package size={21} />}
                tone="gold"
              />
              <MetricCard
                title="Stock faible"
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
                  <Text style={styles.panelTitle}>Évolution des ventes</Text>
                  <Text style={styles.panelSubtitle}>7 derniers jours · avant retours</Text>
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
                  <Text style={styles.panelTitle}>Ventes récentes</Text>
                  <Text style={styles.panelSubtitle}>Dernières factures complétées</Text>
                </View>
                <Text style={styles.counter}>{sales.length}</Text>
              </View>

              {sales.slice(0, 8).length === 0 ? (
                <View style={styles.emptyState}>
                  <ShoppingBag size={27} color={COLORS.muted} />
                  <Text style={styles.emptyTitle}>Aucune vente complétée</Text>
                  <Text style={styles.emptyText}>
                    Les factures terminées apparaîtront ici.
                  </Text>
                </View>
              ) : (
                sales.slice(0, 8).map(sale => (
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
                  <Text style={styles.panelTitle}>Alertes de stock</Text>
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
                  onPress={() => setView(view === 'products' ? 'dashboard' : 'products')}
                >
                  <Text style={styles.smallButtonText}>
                    {view === 'products' ? 'Masquer' : 'Afficher'}
                  </Text>
                </TouchableOpacity>
              </View>

              {view === 'products' && (
                products.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Package size={26} color={COLORS.muted} />
                    <Text style={styles.emptyText}>Aucun produit dans ce catalogue.</Text>
                  </View>
                ) : products.map(product => (
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
                ))
              )}
            </View>

            <Text style={styles.disclaimer}>
              Les statistiques utilisent les données enregistrées dans cette boutique.
              Les ventes sont basées sur les factures complétées. La valeur du stock
              utilise le coût d'achat des variantes. Les dépenses ne représentent pas
              à elles seules le bénéfice net comptable.
            </Text>
          </>
        )}

        <Text style={styles.footer}>STYLEPRO MANAGER · Gestion commerciale</Text>
      </ScrollView>

      <Modal
        visible={notificationsOpen}
        animationType="slide"
        onRequestClose={() => setNotificationsOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
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
            <Text style={styles.disclaimer}>Ces notifications sont calculées à partir des mouvements de stock enregistrés. Elles ne modifient aucune donnée.</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loginContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
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
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
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
  content: { padding: 18, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
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
