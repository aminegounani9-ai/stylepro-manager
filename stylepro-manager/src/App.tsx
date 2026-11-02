
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  Shirt,
  Store,
  Package,
  LogOut,
  Plus,
  Sun,
  Moon,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff,
  LayoutDashboard,
  ShoppingBag,
  Settings,
  Users,
  TrendingUp,
  Search,
  ChevronRight,
  LockKeyhole,
  Pencil,
  Copy,
  RotateCcw,
  CheckSquare,
  Square,
  Printer,
  Check,
  Tag,
  QrCode,
  Boxes,
  ShoppingCart,
  Factory,
  Truck,
  Activity,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import MobileScanner from './MobileScanner'
import AtelierModule from './AtelierModule'
import LivraisonModule from './LivraisonModule'
import './atelier.css'
import './stylepro.css'


type PromotionRow = {
  id: string
  store_id: string
  name: string
  description: string | null
  discount_type: 'amount' | 'percent'
  discount_value: number
  start_at: string
  end_at: string
  is_active: boolean
  created_at: string
}

type StoreRow = {
  id: string
  name: string
  currency: string
}

type ProductRow = {
  id: string
  name: string
  target_audience: string
  description?: string | null
  category_id?: string | null
  brand_id?: string | null
  active: boolean
  image_url?: string | null
}


type CategoryRow = {
  id: string
  name: string
}

type BrandRow = {
  id: string
  name: string
}



type POSVariant = {
  id: string
  product_id: string
  sku: string
  barcode: string | null
  qr_token: string | null
  size: string | null
  color: string | null
  purchase_cost: number
  sale_price: number
  min_stock: number
  active: boolean
}

type POSCustomer = { id: string; full_name: string; phone: string | null }

type ReturnSale = {
  id: string
  sale_number: number
  total: number
  status: string
  created_at: string
  currency: string
}
type ReturnLine = {
  sale_item_id: string
  variant_id: string
  name: string
  sku: string
  size: string | null
  color: string | null
  sold_quantity: number
  already_returned: number
  unit_price: number
  remaining: number
  quantity: number
  restock: boolean
}
type POSCartItem = {
  variant_id: string
  name: string
  sku: string
  unit_price: number
  quantity: number
  stock: number
  size: string | null
  color: string | null
  discount_type: 'amount' | 'percent'
  discount_value: number
}

type VariantDraft = {
  id?: string
  sku: string
  barcode: string
  size: string
  color: string
  purchase_cost: string
  sale_price: string
  min_stock: string
}

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined

const LABEL_SETTINGS_KEY = 'stylepro_qr_label_settings_v1'

type LabelSettings = {
  labelPaperSize: 'A4' | '50x30' | '70x40'
  labelColumns: number
  labelCopies: number
  labelCopiesByVariant: Record<string, number>
  showLabelName: boolean
  showLabelSku: boolean
  showLabelPrice: boolean
  showLabelColor: boolean
  showLabelSize: boolean
}

function loadLabelSettings(): Partial<LabelSettings> {
  try {
    const raw = localStorage.getItem(LABEL_SETTINGS_KEY)
    if (!raw) return {}

    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

    const data = value as Record<string, unknown>
    const result: Partial<LabelSettings> = {}

    if (['A4', '50x30', '70x40'].includes(String(data.labelPaperSize))) {
      result.labelPaperSize = data.labelPaperSize as LabelSettings['labelPaperSize']
    }

    if (typeof data.labelColumns === 'number' && [2, 3, 4].includes(data.labelColumns)) {
      result.labelColumns = data.labelColumns
    }

    if (typeof data.labelCopies === 'number' && Number.isInteger(data.labelCopies)) {
      result.labelCopies = Math.max(1, Math.min(100, data.labelCopies))
    }

    if (data.labelCopiesByVariant && typeof data.labelCopiesByVariant === 'object' && !Array.isArray(data.labelCopiesByVariant)) {
      const copies: Record<string, number> = {}
      for (const [id, count] of Object.entries(data.labelCopiesByVariant as Record<string, unknown>)) {
        if (typeof count === 'number' && Number.isInteger(count)) {
          copies[id] = Math.max(1, Math.min(100, count))
        }
      }
      result.labelCopiesByVariant = copies
    }

    for (const key of ['showLabelName', 'showLabelSku', 'showLabelPrice', 'showLabelColor', 'showLabelSize'] as const) {
      if (typeof data[key] === 'boolean') result[key] = data[key]
    }

    return result
  } catch {
    return {}
  }
}

const STOCK_LOCATIONS = {
  boutique: '5f2ccda1-58c1-4282-997b-309698834ad7',
  reserve: 'd67f391c-a873-4b56-a8db-0e709117eae6'
} as const

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'forgot' | 'reset'>('login')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [storeName, setStoreName] = useState('')
  const [stores, setStores] = useState<StoreRow[]>([])
  const [storeId, setStoreId] = useState('')
  const [currentView, setCurrentView] = useState<
  | 'dashboard'
  | 'catalogue'
  | 'atelier'  
  | 'livraisons'
  | 'stock'
  | 'sales'
  | 'returns'
  | 'customers'
  | 'statistics'
  | 'labels'
  | 'promotions'
>('dashboard')
  const [promotions, setPromotions] = useState<PromotionRow[]>([])
  const [promotionProductIdsByPromotion, setPromotionProductIdsByPromotion] = useState<Record<string, string[]>>({})
  const [promotionLoading, setPromotionLoading] = useState(false)
  const [promotionSaving, setPromotionSaving] = useState(false)
  const [promotionEditingId, setPromotionEditingId] = useState<string | null>(null)
  const [promotionName, setPromotionName] = useState('')
  const [promotionDescription, setPromotionDescription] = useState('')
  const [promotionType, setPromotionType] = useState<'amount' | 'percent'>('percent')
  const [promotionValue, setPromotionValue] = useState('10')
  const [promotionStart, setPromotionStart] = useState('')
  const [promotionEnd, setPromotionEnd] = useState('')
  const [promotionActive, setPromotionActive] = useState(false)
  const [promotionProductIds, setPromotionProductIds] = useState<string[]>([])
  const [promotionSearch, setPromotionSearch] = useState('')
  const [stockLocation, setStockLocation] = useState<'boutique' | 'reserve'>('boutique')
  const [labelVariants, setLabelVariants] = useState<POSVariant[]>([])
  const [labelSearch, setLabelSearch] = useState('')
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([])
  const [labelLoading, setLabelLoading] = useState(false)
  const [labelError, setLabelError] = useState('')
  const [labelImages, setLabelImages] = useState<Record<string, string>>({})

  const [labelPaperSize, setLabelPaperSize] = useState<LabelSettings['labelPaperSize']>(() => loadLabelSettings().labelPaperSize ?? 'A4')
  const [labelColumns, setLabelColumns] = useState(() => loadLabelSettings().labelColumns ?? 3)
  const [labelCopies, setLabelCopies] = useState(() => loadLabelSettings().labelCopies ?? 1)
  const [labelCopiesByVariant, setLabelCopiesByVariant] = useState<Record<string, number>>(() => loadLabelSettings().labelCopiesByVariant ?? {})
  const [showLabelName, setShowLabelName] = useState(() => loadLabelSettings().showLabelName ?? true)
  const [showLabelSku, setShowLabelSku] = useState(() => loadLabelSettings().showLabelSku ?? true)
  const [showLabelPrice, setShowLabelPrice] = useState(() => loadLabelSettings().showLabelPrice ?? true)
  const [showLabelColor, setShowLabelColor] = useState(() => loadLabelSettings().showLabelColor ?? true)
  const [showLabelSize, setShowLabelSize] = useState(() => loadLabelSettings().showLabelSize ?? true)

  const [posVariants, setPosVariants] = useState<POSVariant[]>([])
  const [posCustomers, setPosCustomers] = useState<POSCustomer[]>([])
  const [posStocks, setPosStocks] = useState<Record<string, number>>({})
  const [stockByLocation, setStockByLocation] = useState<
  Record<string, { boutique: number; reserve: number }>
>({})
  const [movementVariant, setMovementVariant] = useState('')
  const [movementType, setMovementType] = useState<'in' | 'out' | 'adjustment'>('in')
  const [movementQty, setMovementQty] = useState('1')
  const [movementCost, setMovementCost] = useState('')
  const [movementReason, setMovementReason] = useState('')
  const [movementBusy, setMovementBusy] = useState(false)
  const [transferVariant, setTransferVariant] = useState('')
  const [transferFrom, setTransferFrom] = useState<'boutique' | 'reserve'>('reserve')
  const [transferTo, setTransferTo] = useState<'boutique' | 'reserve'>('boutique')
  const [transferQty, setTransferQty] = useState('1')
  const [transferReason, setTransferReason] = useState('')
  const [transferBusy, setTransferBusy] = useState(false)
  const [movementHistory, setMovementHistory] = useState<any[]>([])
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [stockSearch, setStockSearch] = useState('')
  const [stockFilter, setStockFilter] = useState<
  'all' | 'low' | 'out' | 'available'
>('all')
  const [posCart, setPosCart] = useState<POSCartItem[]>([])
  const [posSearch, setPosSearch] = useState('')
  const [posCategoryFilter, setPosCategoryFilter] = useState('')
  const [posBrandFilter, setPosBrandFilter] = useState('')
  const [posSizeFilter, setPosSizeFilter] = useState('')
  const [posColorFilter, setPosColorFilter] = useState('')
  const [posPaymentMethod, setPosPaymentMethod] = useState<'cash' | 'card' | 'mixed'>('cash')
  const [posCashReceived, setPosCashReceived] = useState('')
  const [posCardAmount, setPosCardAmount] = useState('')
  const getPOSApplicablePromotion = (i: POSCartItem): PromotionRow | null => {
    const variant = posVariants.find(v => v.id === i.variant_id)
    if (!variant) return null

    const now = Date.now()
    const eligible = promotions.filter(p => {
      const linkedProducts = promotionProductIdsByPromotion[p.id] ?? []
      return p.is_active
        && linkedProducts.includes(variant.product_id)
        && new Date(p.start_at).getTime() <= now
        && new Date(p.end_at).getTime() >= now
    })

    return eligible
      .map(p => {
        const raw = Number(p.discount_value) || 0
        const amount = p.discount_type === 'percent'
          ? i.unit_price * Math.min(100, Math.max(0, raw)) / 100
          : Math.min(i.unit_price, Math.max(0, raw))
        return { promotion: p, discount: Math.round(amount * 100) / 100 }
      })
      .sort((a, b) => b.discount - a.discount)[0]?.promotion ?? null
  }

  const getPOSUnitDiscount = (i: POSCartItem) => {
    const promotion = getPOSApplicablePromotion(i)
    if (promotion) {
      const value = Math.max(0, Number(promotion.discount_value) || 0)
      const discount = promotion.discount_type === 'percent'
        ? i.unit_price * Math.min(100, value) / 100
        : Math.min(i.unit_price, value)
      return Math.round(discount * 100) / 100
    }

    const value = Math.max(0, Number(i.discount_value) || 0)
    const discount = i.discount_type === 'percent'
      ? i.unit_price * Math.min(100, value) / 100
      : Math.min(i.unit_price, value)
    return Math.round(discount * 100) / 100
  }
  const getPOSLineDiscount = (i: POSCartItem) =>
    Math.round(getPOSUnitDiscount(i) * i.quantity * 100) / 100
  const getPOSLineTotal = (i: POSCartItem) =>
    Math.max(0, i.unit_price * i.quantity - getPOSLineDiscount(i))
  const posSubtotal = posCart.reduce((n, i) => n + i.unit_price * i.quantity, 0)
  const posDiscountTotal = posCart.reduce((n, i) => n + getPOSLineDiscount(i), 0)
  const posPaymentTotal = Math.max(0, Math.round((posSubtotal - posDiscountTotal) * 100) / 100)
  const posCashValue = Math.max(0, Number(posCashReceived) || 0)
  const posCardValue = Math.max(0, Number(posCardAmount) || 0)
  const posPaidValue = posPaymentMethod === 'cash'
    ? posCashValue
    : posPaymentMethod === 'card'
      ? posPaymentTotal
      : posCashValue + posCardValue
  const posChangeValue = posPaymentMethod === 'cash'
    ? Math.max(0, posCashValue - posPaymentTotal)
    : Math.max(0, posPaidValue - posPaymentTotal)
  const posRemainingValue = Math.max(0, posPaymentTotal - posPaidValue)
  const [posCustomerId, setPosCustomerId] = useState('')
  const [posBusy, setPosBusy] = useState(false)
  const [lastReceipt, setLastReceipt] = useState<{sale_number: number; total: number} | null>(null)
  const [salesHistory, setSalesHistory] = useState<{id: string; sale_number: number; total: number; status: string; created_at: string; currency: string}[]>([])
  const [salesHistoryLoading, setSalesHistoryLoading] = useState(false)
  const [salesHistorySearch, setSalesHistorySearch] = useState('')

  type ReceiptPreview = {
    sale_number: number
    created_at: string
    total: number
    currency: string
    status: string
    items: { name: string; sku: string; size: string; color: string; quantity: number; unit_price: number; discount: number }[]
  }
  const [receiptPreview, setReceiptPreview] = useState<ReceiptPreview | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [invoicePrintFormat, setInvoicePrintFormat] = useState<'a4' | 'thermal'>('a4')

  async function openInvoicePreview(saleId?: string, saleNumber?: number) {
    if (!storeId) return
    setReceiptLoading(true)
    setError('')
    try {
      let saleQuery = supabase
        .from('sales')
        .select('id,sale_number,total,status,created_at,currency')
        .eq('store_id', storeId)

      saleQuery = saleId
        ? saleQuery.eq('id', saleId)
        : saleQuery.eq('sale_number', saleNumber ?? 0)

      const { data: sale, error: saleError } = await saleQuery.maybeSingle()
      if (saleError) throw saleError
      if (!sale) throw new Error('Facture introuvable.')

      const { data: items, error: itemsError } = await supabase
        .from('sale_items')
        .select('variant_id,quantity,unit_price,discount')
        .eq('store_id', storeId)
        .eq('sale_id', sale.id)

      if (itemsError) throw itemsError
      if (!items?.length) throw new Error('Aucun article trouvé sur cette facture.')

      const variantIds = [...new Set(items.map(item => item.variant_id))]
      const { data: variants, error: variantsError } = await supabase
        .from('product_variants')
        .select('id,product_id,sku,size,color')
        .eq('store_id', storeId)
        .in('id', variantIds)

      if (variantsError) throw variantsError

      const variantRows = variants ?? []
      const productIds = [...new Set(variantRows.map(v => v.product_id))]
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id,name')
        .eq('store_id', storeId)
        .in('id', productIds)

      if (productsError) throw productsError

      const variantMap = new Map(variantRows.map(v => [v.id, v]))
      const productMap = new Map((products ?? []).map(p => [p.id, p]))
      setReceiptPreview({
        sale_number: Number(sale.sale_number),
        created_at: sale.created_at,
        total: Number(sale.total),
        currency: sale.currency || 'DZD',
        status: sale.status,
        items: items.map(item => {
          const variant = variantMap.get(item.variant_id)
          const product = variant ? productMap.get(variant.product_id) : null
          return {
            name: product?.name || 'Article',
            sku: variant?.sku || '',
            size: variant?.size || '',
            color: variant?.color || '',
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            discount: Number(item.discount || 0),
          }
        })
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger la facture.')
    } finally {
      setReceiptLoading(false)
    }
  }


  const [returnSearch, setReturnSearch] = useState('')
  const [returnSale, setReturnSale] = useState<ReturnSale | null>(null)
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([])
  const [returnReason, setReturnReason] = useState('Retour produit')
  const [returnLoading, setReturnLoading] = useState(false)
  const [returnBusy, setReturnBusy] = useState(false)
  const [products, setProducts] = useState<ProductRow[]>([])

  const stockSummary = posVariants.reduce(
  (summary, variant) => {
    const quantity = posStocks[variant.id] ?? 0
    const minimum = Number(variant.min_stock ?? 0)
    const cost = Number(variant.purchase_cost ?? 0)

    summary.totalUnits += quantity
    summary.stockValue += quantity * cost

    if (quantity <= 0) {
      summary.outOfStock += 1
    } else if (quantity <= minimum) {
      summary.lowStock += 1
    } else {
      summary.available += 1
    }

    return summary
  },
  {
    totalUnits: 0,
    stockValue: 0,
    lowStock: 0,
    outOfStock: 0,
    available: 0,
  }
)

const filteredStockVariants = posVariants.filter(variant => {
  const productName =
    products.find(product => product.id === variant.product_id)?.name ?? ''

  const searchText = [
    productName,
    variant.sku,
    variant.barcode ?? '',
    variant.size ?? '',
    variant.color ?? '',
  ].join(' ').toLowerCase()

  const quantity = posStocks[variant.id] ?? 0
  const minimum = Number(variant.min_stock ?? 0)

  const matchesSearch = searchText.includes(stockSearch.trim().toLowerCase())

  const matchesFilter =
    stockFilter === 'all' ||
    (stockFilter === 'out' && quantity <= 0) ||
    (stockFilter === 'low' && quantity > 0 && quantity <= minimum) ||
    (stockFilter === 'available' && quantity > minimum)

  return matchesSearch && matchesFilter
})

  type AnalyticsData = {
    sales: { id: string; sale_number: number; total: number; status: string; created_at: string; completed_at: string | null }[]
    expenses: { amount: number; expense_date: string }[]
    returns: { sale_id: string; total: number; created_at: string }[]
    lowStock: { id: string; sku: string; current: number; minimum: number }[]
  }
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    sales: [], expenses: [], returns: [], lowStock: []
  })
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [scannerCode, setScannerCode] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')
  const [scannedProductId, setScannedProductId] = useState<string | null>(null)
  const [scannedVariantId, setScannedVariantId] = useState<string | null>(null)
  const [catalogueScanCode, setCatalogueScanCode] = useState('')
  const [mobileSession, setMobileSession] = useState<{
    id: string
    session_token: string
    expires_at: string
  } | null>(null)
  const [mobileQr, setMobileQr] = useState('')
  const [mobileBusy, setMobileBusy] = useState(false)
  const mobileChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null)
  const scannerInputRef = useRef<HTMLInputElement | null>(null)
  const scannerBusyRef = useRef(false)
  const scannerElementId = 'stylepro-pos-camera'
  type ThemeMode = 'light' | 'dark' | 'system'
type AccentName = 'beige' | 'green' | 'blue' | 'burgundy' | 'slate'

const [themeMode, setThemeMode] = useState<ThemeMode>(
  () => (localStorage.getItem('stylepro-theme') as ThemeMode) || 'light'
)
const [systemDark, setSystemDark] = useState(
  () => window.matchMedia('(prefers-color-scheme: dark)').matches
)
const [accent, setAccent] = useState<AccentName>(
  () => (localStorage.getItem('stylepro-accent') as AccentName) || 'beige'
)

const dark = themeMode === 'dark' || (themeMode === 'system' && systemDark)

const accentColors: Record<AccentName, { primary: string; hover: string }> = {
  beige: { primary: '#a9875b', hover: '#896a43' },
  green: { primary: '#397568', hover: '#285c51' },
  blue: { primary: '#466b9d', hover: '#34547f' },
  burgundy: { primary: '#914c60', hover: '#75394b' },
  slate: { primary: '#626b78', hover: '#48515e' },
}

useEffect(() => {
  localStorage.setItem('stylepro-theme', themeMode)
}, [themeMode])

useEffect(() => {
  localStorage.setItem('stylepro-accent', accent)
}, [accent])

useEffect(() => {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const updateSystemTheme = () => setSystemDark(media.matches)
  updateSystemTheme()
  media.addEventListener?.('change', updateSystemTheme)
  return () => media.removeEventListener?.('change', updateSystemTheme)
}, [])
  const [search, setSearch] = useState('')

  
  useEffect(() => {
    const settings: LabelSettings = {
      labelPaperSize,
      labelColumns,
      labelCopies,
      labelCopiesByVariant,
      showLabelName,
      showLabelSku,
      showLabelPrice,
      showLabelColor,
      showLabelSize,
    }

    try {
      localStorage.setItem(LABEL_SETTINGS_KEY, JSON.stringify(settings))
    } catch (error) {
      console.error('Impossible de sauvegarder les paramètres des étiquettes QR.', error)
    }
  }, [
    labelPaperSize,
    labelColumns,
    labelCopies,
    labelCopiesByVariant,
    showLabelName,
    showLabelSku,
    showLabelPrice,
    showLabelColor,
    showLabelSize,
  ])

useEffect(() => {




  return () => {
    const scanner = scannerRef.current
    if (scanner?.isScanning) {
      void scanner.stop().catch(() => {})
    }
  }
}, [])
  
const [categories, setCategories] = useState<CategoryRow[]>([])
const [brands, setBrands] = useState<BrandRow[]>([])


const [showProductForm, setShowProductForm] = useState(false)
const [editingProductId, setEditingProductId] = useState<string | null>(null)
const [savingProduct, setSavingProduct] = useState(false)

const [productName, setProductName] = useState('')
const [productDescription, setProductDescription] = useState('')
const [targetAudience, setTargetAudience] = useState('women')
const [categoryId, setCategoryId] = useState('')
const [brandId, setBrandId] = useState('')
const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
const [imagePreviewUrl, setImagePreviewUrl] = useState('')
const [existingImageUrl, setExistingImageUrl] = useState('')


const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([
  {
    sku: '',
    barcode: '',
    size: '',
    color: '',
    purchase_cost: '0',
    sale_price: '',
    min_stock: '0',
  },
])

  useEffect(() => {
    let alive = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return
      if (error) setError(error.message)
      setUser(data.session?.user ?? null)
      if (window.location.hash.includes('type=recovery')) setAuthMode('reset')
      setReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
        if (event === 'PASSWORD_RECOVERY') setAuthMode('reset')
        if (event === 'SIGNED_IN') {
          setAuthMode('login')
          setPassword('')
          setConfirmPassword('')
        }
        setError('')
        setMessage('')
      }
    )

    return () => {
      alive = false
      listener.subscription.unsubscribe()
    }
  }, [])

  const loadStores = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('stores')
      .select('id,name,currency')
      .order('created_at', { ascending: true })

    if (error) {
      setError(`Chargement des boutiques : ${error.message}`)
      setLoading(false)
      return
    }

    const rows = (data ?? []) as StoreRow[]
    setStores(rows)
    setStoreId(previous =>
      rows.some(row => row.id === previous) ? previous : rows[0]?.id ?? ''
    )
    setLoading(false)
  }, [user])

  const loadProducts = useCallback(async () => {
    if (!storeId) {
      setProducts([])
      return
    }

    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('products')
      .select('id,name,target_audience,description,category_id,brand_id,active,image_url')
      .eq('store_id', storeId)
      .order('name')

    if (error) {
      setError(`Chargement des articles : ${error.message}`)
    } else {
      setProducts((data ?? []) as ProductRow[])
    }

    setLoading(false)
  }, [storeId])


  const loadAnalytics = useCallback(async () => {
    if (!storeId) {
      setAnalytics({ sales: [], expenses: [], returns: [], lowStock: [] })
      return
    }

    setAnalyticsLoading(true)
    try {
      const [salesResult, expensesResult, returnsResult, variantsResult, movementsResult] =
        await Promise.all([
          supabase.from('sales')
            .select('id,sale_number,total,status,created_at,completed_at')
            .eq('store_id', storeId)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(500),
          supabase.from('expenses')
            .select('amount,expense_date')
            .eq('store_id', storeId),
          supabase.from('returns')
            .select('sale_id,total,created_at')
            .eq('store_id', storeId),
          supabase.from('product_variants')
            .select('id,sku,min_stock,active')
            .eq('store_id', storeId)
            .eq('active', true)
        ])

      const failed = [
        salesResult.error, expensesResult.error, returnsResult.error,
        variantsResult.error
      ].find(Boolean)
      if (failed) throw new Error(failed.message)

      const movementRows: Array<{ variant_id: string; quantity_delta: number }> = []
      for (let offset = 0; ; offset += 1000) {
        const page = await supabase.from('stock_movements')
          .select('id,variant_id,quantity_delta')
          .eq('store_id', storeId)
          .order('id', { ascending: true })
          .range(offset, offset + 999)
        if (page.error) throw new Error(page.error.message)
        movementRows.push(...(page.data ?? []))
        if ((page.data ?? []).length < 1000) break
      }

      const stock: Record<string, number> = {}
      for (const movement of movementRows) {
        stock[movement.variant_id] =
          (stock[movement.variant_id] ?? 0) + Number(movement.quantity_delta ?? 0)
      }

    

     
      const lowStock = (variantsResult.data ?? [])
        .map(v => ({
          id: v.id,
          sku: v.sku || 'Sans référence',
          current: stock[v.id] ?? 0,
          minimum: Number(v.min_stock ?? 0)
        }))
        .filter(v => v.minimum > 0 && v.current <= v.minimum)
        .sort((a, b) => a.current - b.current)

      setAnalytics({
        sales: (salesResult.data ?? []) as AnalyticsData['sales'],
        expenses: (expensesResult.data ?? []) as AnalyticsData['expenses'],
        returns: (returnsResult.data ?? []) as AnalyticsData['returns'],
        lowStock
      })
    } catch (e) {
      setError(e instanceof Error ? `Statistiques : ${e.message}` : 'Erreur de chargement des statistiques.')
    } finally {
      setAnalyticsLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    if (user && storeId && (currentView === 'statistics' || currentView === 'dashboard')) {
      void loadAnalytics()
    }
  }, [user, storeId, currentView, loadAnalytics])

  useEffect(() => {
    if (user) void loadStores()
    else {
      setStores([])
      setStoreId('')
      setProducts([])
    }
  }, [user, loadStores])

  useEffect(() => {
    if (user && storeId) void loadProducts()
    else setProducts([])
  }, [user, storeId, loadProducts])

  
const loadProductOptions = useCallback(async () => {
  if (!storeId) {
    setCategories([])
    setBrands([])
    return
  }

  const [categoryResult, brandResult] = await Promise.all([
    supabase
      .from('categories')
      .select('id,name')
      .eq('store_id', storeId)
      .order('name'),
    supabase
      .from('brands')
      .select('id,name')
      .eq('store_id', storeId)
      .order('name'),
  ])

  if (categoryResult.error) {
    setError(`Chargement des catégories : ${categoryResult.error.message}`)
    return
  }

  if (brandResult.error) {
    setError(`Chargement des marques : ${brandResult.error.message}`)
    return
  }

  setCategories(categoryResult.data ?? [])
  setBrands(brandResult.data ?? [])
}, [storeId])

  useEffect(() => {
    if (user && storeId) {
      void loadProductOptions()
    } else {
      setCategories([])
      setBrands([])
    }
  }, [user, storeId, loadProductOptions])

  const BOUTIQUE_LOCATION_ID =
  '5f2ccda1-58c1-4282-997b-309698834ad7'

  const RESERVE_LOCATION_ID =
  'd67f391c-a873-4b56-a8db-0e709117eae6'


const loadPOSData = useCallback(async () => {
  if (!storeId) return

  const [vr, cr] = await Promise.all([
    supabase.from('product_variants')
      .select('id,product_id,sku,barcode,qr_token,size,color,purchase_cost,sale_price,min_stock,active')
      .eq('store_id', storeId)
      .eq('active', true)
      .order('sku'),

    supabase.from('customers')
      .select('id,full_name,phone')
      .eq('store_id', storeId)
      .order('full_name')
  ])

  if (vr.error) throw new Error(`Variantes : ${vr.error.message}`)
  if (cr.error) throw new Error(`Clients : ${cr.error.message}`)

  const movementRows: Array<{ variant_id: string; location_id: string; quantity_delta: number }> = []
  for (let offset = 0; ; offset += 1000) {
    const page = await supabase.from('stock_movements')
      .select('id,variant_id,location_id,quantity_delta')
      .eq('store_id', storeId)
      .in('location_id', [BOUTIQUE_LOCATION_ID, RESERVE_LOCATION_ID])
      .order('id', { ascending: true })
      .range(offset, offset + 999)
    if (page.error) throw new Error(`Stock : ${page.error.message}`)
    movementRows.push(...(page.data ?? []))
    if ((page.data ?? []).length < 1000) break
  }

  const activeIds = new Set(
    products.filter(p => p.active).map(p => p.id)
  )

  setPosVariants(
    ((vr.data ?? []) as POSVariant[])
      .filter(v => activeIds.has(v.product_id))
  )

  setPosCustomers((cr.data ?? []) as POSCustomer[])

  const boutiqueStocks: Record<string, number> = {}
  const reserveStocks: Record<string, number> = {}

  for (const m of movementRows) {
    const quantity = Number(m.quantity_delta)

    if (m.location_id === BOUTIQUE_LOCATION_ID) {
      boutiqueStocks[m.variant_id] =
        (boutiqueStocks[m.variant_id] ?? 0) + quantity
    }

    if (m.location_id === RESERVE_LOCATION_ID) {
      reserveStocks[m.variant_id] =
        (reserveStocks[m.variant_id] ?? 0) + quantity
    }
  }

  const allStocks: Record<
    string,
    { boutique: number; reserve: number }
  > = {}

  for (const variant of (vr.data ?? []) as POSVariant[]) {
    allStocks[variant.id] = {
      boutique: boutiqueStocks[variant.id] ?? 0,
      reserve: reserveStocks[variant.id] ?? 0
    }
  }

  setPosStocks(boutiqueStocks)
  setStockByLocation(allStocks)

  setPosCart(cart =>
    cart.map(item => ({
      ...item,
      stock: boutiqueStocks[item.variant_id] ?? 0
    }))
  )
}, [storeId, products])

  useEffect(() => {
  if (
    !user ||
    !storeId ||
    !['sales', 'customers', 'stock', 'promotions', 'catalogue'].includes(currentView)
  ) return

  void loadPOSData().catch(e =>
    setError(e instanceof Error ? e.message : 'Erreur de chargement POS')
  )
}, [user, storeId, currentView, loadPOSData])

  const loadMovementHistory = useCallback(async () => {
  if (!storeId) return

  const { data, error } = await supabase
    .from('stock_movements')
    .select('id,variant_id,location_id,movement_type,quantity_delta,unit_cost,reason,created_at')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)
  setMovementHistory(data ?? [])
}, [storeId])

useEffect(() => {
  if (user && storeId && currentView === 'stock') {
    void loadMovementHistory().catch(e =>
      setError(e instanceof Error ? e.message : String(e))
    )
  }
}, [user, storeId, currentView, loadMovementHistory])

async function saveStockMovement(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()

  if (!user || !storeId || !movementVariant) return

  const qty = Number(movementQty)

  const minimumQuantity = movementType === 'adjustment' ? 0 : 1
  if (!Number.isInteger(qty) || qty < minimumQuantity) {
    setError(
      movementType === 'adjustment'
        ? 'La quantité réelle doit être un entier positif ou zéro.'
        : 'La quantité doit être un entier strictement positif.'
    )
    return
  }

  setMovementBusy(true)
  setError('')

  try {
    const locationId = STOCK_LOCATIONS[stockLocation]

    const movements: Array<{ quantity_delta: number }> = []
    for (let offset = 0; ; offset += 1000) {
      const page = await supabase.from('stock_movements')
        .select('id,quantity_delta')
        .eq('store_id', storeId)
        .eq('variant_id', movementVariant)
        .eq('location_id', locationId)
        .order('id', { ascending: true })
        .range(offset, offset + 999)
      if (page.error) throw page.error
      movements.push(...(page.data ?? []))
      if ((page.data ?? []).length < 1000) break
    }

    const current = movements.reduce(
      (total, movement) => total + Number(movement.quantity_delta),
      0
    )

    const delta =
      movementType === 'in' ? qty :
      movementType === 'out' ? -qty :
      qty - current

    if (current + delta < 0) {
      throw new Error('Stock insuffisant dans ce magasin.')
    }

    if (movementType === 'adjustment' && delta === 0) {
      throw new Error('Le stock est déjà correct.')
    }

    const unitCost = movementCost.trim()
      ? Number(movementCost)
      : null

    if (
      unitCost !== null &&
      (!Number.isFinite(unitCost) || unitCost < 0)
    ) {
      throw new Error('Prix d’achat invalide.')
    }

    const { error } = await supabase
      .from('stock_movements')
      .insert({
        store_id: storeId,
        variant_id: movementVariant,
        location_id: locationId,
        movement_type:
          movementType === 'in' ? 'purchase' :
          movementType === 'out' ? 'damage' :
          'adjustment',
        quantity_delta: delta,
        unit_cost: unitCost,
        reason: movementReason || 'Mouvement manuel',
        created_by: user.id
      })

    if (error) throw error

    setMovementQty('1')
    setMovementCost('')
    setMovementReason('')

    await loadPOSData()
    await loadMovementHistory()

  } catch (err) {
    setError(
      err instanceof Error
        ? `Erreur de mouvement : ${err.message}`
        : 'Erreur de mouvement.'
    )
  } finally {
    setMovementBusy(false)
  }
}

async function saveStockTransfer(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()

  if (!user || !storeId || !transferVariant) {
    setError('Veuillez sélectionner un article.')
    return
  }

  const qty = Number(transferQty)

  if (!Number.isInteger(qty) || qty <= 0) {
    setError('La quantité doit être un entier positif.')
    return
  }

  if (transferFrom === transferTo) {
    setError('Les emplacements doivent être différents.')
    return
  }

  const sourceLocationId = STOCK_LOCATIONS[transferFrom]
  const destinationLocationId = STOCK_LOCATIONS[transferTo]

  const availableStock =
    stockByLocation[transferVariant]?.[transferFrom] ?? 0

  if (qty > availableStock) {
    setError(
      `Stock insuffisant. Disponible : ${availableStock}`
    )
    return
  }

  setTransferBusy(true)
  setError('')
  setMessage('')

  try {
    const { error: transferError } = await supabase.rpc(
      'transfer_stock',
      {
        p_store_id: storeId,
        p_variant_id: transferVariant,
        p_from_location_id: sourceLocationId,
        p_to_location_id: destinationLocationId,
        p_quantity: qty,
        p_reason: transferReason.trim() || 'Transfert interne'
      }
    )

    if (transferError) throw transferError

    setTransferQty('1')
    setTransferReason('')
    setTransferVariant('')

    await Promise.all([
      loadPOSData(),
      loadMovementHistory()
    ])

    setMessage('Transfert de stock effectué avec succès.')
  } catch (err) {
    setError(
      err instanceof Error
        ? `Erreur de transfert : ${err.message}`
        : 'Impossible d’effectuer le transfert.'
    )
  } finally {
    setTransferBusy(false)
  }
}

function exportMovementHistoryPDF() {
  const rows = movementHistory.map(m => {
    const variant = posVariants.find(v => v.id === m.variant_id)
    const product = products.find(p => p.id === variant?.product_id)

    return {
      date: new Date(m.created_at).toLocaleString('fr-DZ'),
      article: product?.name || variant?.sku || 'Article inconnu',
      sku: variant?.sku || '',
      type: m.movement_type,
      quantity:
        `${Number(m.quantity_delta) > 0 ? '+' : ''}${m.quantity_delta}`,
      reason: m.reason || '—'
    }
  })

  const escapeHTML = (value: string) =>
    value.replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]!)

  const reportWindow = window.open('', '_blank')

  if (!reportWindow) {
    setError('Autorisez les fenêtres pop-up pour exporter le PDF.')
    return
  }

  reportWindow.document.write(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Rapport des mouvements de stock</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 30px;
          color: #292929;
        }
        h1 { font-size: 22px; margin-bottom: 5px; }
        .subtitle { color: #666; margin-bottom: 25px; }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        th, td {
          border: 1px solid #ddd;
          padding: 9px;
          text-align: left;
        }
        th {
          background: #eee7dc;
        }
        tr { page-break-inside: avoid; }
        .footer {
          margin-top: 25px;
          font-size: 11px;
          color: #666;
        }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <h1>Rapport des mouvements de stock</h1>
      <div class="subtitle">
        StylePro Manager — Généré le ${escapeHTML(new Date().toLocaleString('fr-DZ'))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Article</th>
            <th>SKU</th>
            <th>Type</th>
            <th>Variation</th>
            <th>Motif</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td>${escapeHTML(row.date)}</td>
              <td>${escapeHTML(row.article)}</td>
              <td>${escapeHTML(row.sku)}</td>
              <td>${escapeHTML(row.type)}</td>
              <td>${escapeHTML(row.quantity)}</td>
              <td>${escapeHTML(row.reason)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer">
        Nombre total de mouvements : ${rows.length}
      </div>

      <script>
        window.onload = function() {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `)

  reportWindow.document.close()
}

function handleScannedCode(rawCode: string) {
  const code = rawCode.trim()
  if (!code || scannerBusyRef.current) return

  scannerBusyRef.current = true
  setScannerMessage('')

  try {
    const normalized = code.toLowerCase()

    const variant = posVariants.find(v =>
      v.active &&
      (
        v.sku.trim().toLowerCase() === normalized ||
(v.barcode ?? '').trim().toLowerCase() === normalized ||
(v.qr_token ?? '').trim().toLowerCase() === normalized
      )
    )

    if (!variant) {
      setScannerMessage(`Code introuvable : ${code}`)
      setError('')
      return
    }

    const product = products.find(
      p => p.id === variant.product_id && p.active
    )

    if (!product) {
      setScannerMessage('Produit inactif ou introuvable.')
      return
    }

    const stock = posStocks[variant.id] ?? 0
    const existing = posCart.find(i => i.variant_id === variant.id)
    const currentQuantity = existing?.quantity ?? 0

    if (stock <= currentQuantity) {
      setScannerMessage(`Stock insuffisant : ${product.name}`)
      return
    }

    const added = addPOSItem(variant)

if (added) {
  setScannerMessage(`Article ajouté : ${product.name}`)
  setPosSearch('')
} else {
  setScannerMessage(`Ajout impossible : ${product.name}`)
}
  } finally {
    window.setTimeout(() => {
      scannerBusyRef.current = false
    }, 250)
  }
}

function findProductByScannedCode(rawCode: string) {
  const code = rawCode.trim().toLowerCase()
  if (!code) return

  const variant = posVariants.find(v =>
    v.active &&
    (
      v.sku.trim().toLowerCase() === code ||
      (v.barcode ?? '').trim().toLowerCase() === code ||
      (v.qr_token ?? '').trim().toLowerCase() === code
    )
  )

  if (!variant) {
    setScannerMessage(`Code introuvable : ${rawCode}`)
    setScannedProductId(null)
    setScannedVariantId(null)
    return
  }

  const product = products.find(
    p => p.id === variant.product_id && p.active
  )

  if (!product) {
    setScannerMessage('Produit inactif ou introuvable.')
    return
  }

  setScannedProductId(product.id)
  setScannedVariantId(variant.id)
  setScannerMessage(`Produit trouvé : ${product.name}`)
  setCatalogueScanCode('')
  setCurrentView('catalogue')
}  

async function startPOSCamera() {
  try {
    setScannerMessage('')
    setError('')

    const { Html5Qrcode } = await import('html5-qrcode')
    const scanner = new Html5Qrcode(scannerElementId)
    scannerRef.current = scanner

    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => {
        if (scannerBusyRef.current) return
        handleScannedCode(decodedText)
      },
      () => {}
    )

    setCameraOpen(true)
  } catch (e) {
    scannerRef.current = null
    setCameraOpen(false)
    setScannerMessage(
      e instanceof Error
        ? `Impossible d'ouvrir la caméra : ${e.message}`
        : 'Impossible d’ouvrir la caméra.'
    )
  }
}

async function stopPOSCamera() {
  const scanner = scannerRef.current

  if (scanner) {
    try {
      if (scanner.isScanning) {
        await scanner.stop()
      }
      scanner.clear()
    } catch {
      // La caméra peut déjà être arrêtée.
    }
  }

  scannerRef.current = null
  setCameraOpen(false)
}

  function addPOSItem(v: POSVariant): boolean {
  const product = products.find(
    p => p.id === v.product_id && p.active
  )

  if (!product) {
    setError('Produit introuvable ou inactif.')
    return false
  }

  const stock = posStocks[v.id] ?? 0

  if (stock <= 0) {
    setError(`Stock nul pour ${product.name}.`)
    return false
  }

  const existing = posCart.find(i => i.variant_id === v.id)

  if (existing && existing.quantity >= stock) {
    setError('Stock insuffisant pour cette quantité.')
    return false
  }

  setError('')
  setLastReceipt(null)

  setPosCart(cart => {
    const old = cart.find(i => i.variant_id === v.id)

    if (old) {
      return cart.map(i =>
        i.variant_id === v.id
          ? { ...i, quantity: Math.min(i.quantity + 1, stock), stock }
          : i
      )
    }

    return [...cart, {
      variant_id: v.id,
      name: product.name,
      sku: v.sku,
      unit_price: Number(v.sale_price),
      quantity: 1,
      stock,
      size: v.size,
      color: v.color,
      discount_type: 'amount' as const,
      discount_value: 0
    }]
  })

  return true
}


  async function searchReturnSale() {
    if (!storeId) return
    const number = Number(returnSearch.trim())
    if (!returnSearch.trim() || !Number.isSafeInteger(number) || number <= 0) {
      setError('Saisissez un numéro de facture valide.')
      return
    }

    setReturnLoading(true)
    setError('')
    setMessage('')
    setReturnSale(null)
    setReturnLines([])

    try {
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('id,sale_number,total,status,created_at,currency')
        .eq('store_id', storeId)
        .eq('sale_number', number)
        .maybeSingle()

      if (saleError) throw saleError
      if (!sale) throw new Error('Facture introuvable dans cette boutique.')
      if (sale.status !== 'completed') {
        throw new Error('Cette facture n’est pas éligible à un retour.')
      }

      const { data: saleItems, error: itemsError } = await supabase
        .from('sale_items')
        .select('id,variant_id,quantity,unit_price,discount')
        .eq('store_id', storeId)
        .eq('sale_id', sale.id)

      if (itemsError) throw itemsError
      if (!saleItems?.length) throw new Error('Aucun article trouvé sur cette facture.')

      const saleItemIds = saleItems.map(item => item.id)
      const variantIds = [...new Set(saleItems.map(item => item.variant_id))]

      const [variantsResult, returnsResult] = await Promise.all([
        supabase.from('product_variants')
          .select('id,product_id,sku,size,color')
          .eq('store_id', storeId)
          .in('id', variantIds),
        supabase.from('return_items')
          .select('sale_item_id,quantity,return_id')
          .eq('store_id', storeId)
          .in('sale_item_id', saleItemIds)
      ])

      if (variantsResult.error) throw variantsResult.error
      if (returnsResult.error) throw returnsResult.error

      const variantRows = variantsResult.data ?? []
      const productIds = [...new Set(variantRows.map(v => v.product_id))]
      const { data: productRows, error: productsError } = await supabase
        .from('products')
        .select('id,name')
        .eq('store_id', storeId)
        .in('id', productIds)

      if (productsError) throw productsError

      const returnedByItem: Record<string, number> = {}
      for (const item of returnsResult.data ?? []) {
        returnedByItem[item.sale_item_id] =
          (returnedByItem[item.sale_item_id] ?? 0) + Number(item.quantity)
      }

      const variantsById = new Map(variantRows.map(v => [v.id, v]))
      const productsById = new Map((productRows ?? []).map(p => [p.id, p]))

      const lines: ReturnLine[] = saleItems.map(item => {
        const variant = variantsById.get(item.variant_id)
        const product = variant ? productsById.get(variant.product_id) : undefined
        const sold = Number(item.quantity)
        const already = returnedByItem[item.id] ?? 0
        const remaining = Math.max(0, sold - already)

        return {
          sale_item_id: item.id,
          variant_id: item.variant_id,
          name: product?.name ?? 'Article supprimé ou introuvable',
          sku: variant?.sku ?? '—',
          size: variant?.size ?? null,
          color: variant?.color ?? null,
          sold_quantity: sold,
          already_returned: already,
          unit_price: Number(item.unit_price) - (Number(item.discount ?? 0) / Math.max(1, Number(item.quantity))),
          remaining,
          quantity: 0,
          restock: true
        }
      })

      setReturnSale(sale as ReturnSale)
      setReturnLines(lines)
      setMessage(`Facture #${sale.sale_number} chargée.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de rechercher cette facture.')
    } finally {
      setReturnLoading(false)
    }
  }

  async function submitReturn() {
    if (!storeId || !returnSale) return
    if (returnBusy) return
    if (returnSale.status !== 'completed') {
      setError('Cette facture ne peut plus recevoir de retour.')
      return
    }

    for (const line of returnLines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 0) {
        setError('Les quantités de retour doivent être des entiers positifs ou zéro.')
        return
      }
      if (line.quantity > line.remaining) {
        setError('La quantité demandée dépasse la quantité encore retournable.')
        return
      }
    }

    const selected = returnLines.filter(line => line.quantity > 0)
    if (!selected.length) {
      setError('Sélectionnez au moins un article et une quantité.')
      return
    }

    setReturnBusy(true)
    setError('')
    setMessage('')

    try {
      const { data, error: rpcError } = await supabase.rpc('create_pos_return', {
        p_store_id: storeId,
        p_sale_id: returnSale.id,
        p_reason: returnReason.trim() || 'Retour produit',
        p_items: selected.map(line => ({
          sale_item_id: line.sale_item_id,
          quantity: line.quantity,
          restock: line.restock
        }))
      })

      if (rpcError) throw rpcError
      const result = Array.isArray(data) ? data[0] : data
      if (!result?.return_id) {
        throw new Error('Le retour n’a pas retourné de référence.')
      }

      setMessage(
        `Retour enregistré — ${Number(result.refund_total).toLocaleString('fr-DZ', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })} DZD`
      )
      setReturnSale(null)
      setReturnLines([])
      setReturnSearch('')
      setReturnReason('Retour produit')
      await loadPOSData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de l’enregistrement du retour.')
    } finally {
      setReturnBusy(false)
    }
  }

  async function loadSalesHistory() {
    if (!storeId) return
    setSalesHistoryLoading(true)
    setError('')
    try {
      let query = supabase
        .from('sales')
        .select('id,sale_number,total,status,created_at,currency')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(100)

      const searchNumber = salesHistorySearch.trim()
      if (searchNumber) {
        const number = Number(searchNumber)
        if (!Number.isSafeInteger(number) || number <= 0) {
          throw new Error('Saisissez un numéro de facture valide.')
        }
        query = query.eq('sale_number', number)
      }

      const { data, error } = await query
      if (error) throw error
      setSalesHistory((data ?? []) as typeof salesHistory)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les factures.')
    } finally {
      setSalesHistoryLoading(false)
    }
  }

  async function finishPOS() {
    if (!storeId || posCart.length === 0) { setError('Le panier est vide.'); return }
    if (posCart.some(item => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > item.stock)) {
      setError('Vérifiez les quantités : elles doivent être entières et ne pas dépasser le stock disponible.')
      return
    }
    if (posPaymentMethod === 'cash' && posCashValue < posPaymentTotal) {
      setError('Le montant reçu en espèces est insuffisant pour valider la vente.')
      return
    }
    if (posPaymentMethod === 'mixed' && (posPaidValue < posPaymentTotal || posCashValue <= 0 || posCardValue <= 0)) {
      setError('Le paiement mixte doit couvrir le total avec des montants positifs en espèces et par carte.')
      return
    }
    setPosBusy(true)
    setError('')
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('create_pos_sale_cart', {
        p_store_id: storeId,
        p_items: posCart.map(i => ({
          variant_id: i.variant_id,
          quantity: i.quantity,
          discount: getPOSLineDiscount(i)
        })),
        p_customer_id: posCustomerId || null
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (!row || row.sale_number == null) throw new Error('La vente n’a pas retourné de numéro de reçu.')
      setLastReceipt({sale_number: Number(row.sale_number), total: Number(row.total)})
      setMessage(`Vente #${row.sale_number} enregistrée avec succès.`)
      setPosCart([])
      setPosCustomerId('')
      setPosCashReceived('')
      setPosCardAmount('')
      setPosPaymentMethod('cash')
      await Promise.all([loadPOSData(), loadProducts()])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la vente.')
    } finally {
      setPosBusy(false)
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (authMode === 'forgot') {
        const email = login.trim()
        if (!email || !email.includes('@')) {
          throw new Error('Saisissez une adresse e-mail valide.')
        }
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setMessage('Si cette adresse est associée à un compte, un lien de réinitialisation sera envoyé.')
      } else if (authMode === 'reset') {
        if (password.length < 8) throw new Error('Le nouveau mot de passe doit contenir au moins 8 caractères.')
        if (password !== confirmPassword) throw new Error('Les deux mots de passe ne correspondent pas.')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setPassword('')
        setConfirmPassword('')
        setAuthMode('login')
        setMessage('Mot de passe modifié avec succès. Vous pouvez vous connecter.')
        window.history.replaceState(null, '', window.location.pathname)
      } else {
        const identifier = login.trim()
        const email = identifier.toLowerCase() === 'admin'
          ? ADMIN_EMAIL?.trim()
          : identifier

        if (!email) {
          throw new Error('Configurez VITE_ADMIN_EMAIL dans .env.local ou utilisez votre adresse e-mail.')
        }

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        setMessage('Connexion réussie.')
        setPassword('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    } finally {
      setLoading(false)
    }
  }

  async function createStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!storeName.trim()) return

    setLoading(true)
    setError('')
    setMessage('')

    try {
      const { data, error } = await supabase.rpc('create_store', {
        p_name: storeName.trim(),
        p_currency: 'DZD',
      })

      if (error) throw error

      const createdId = data as string
      setStoreName('')
      await loadStores()
      setStoreId(createdId)
      setMessage('Boutique créée avec succès.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible.')
    } finally {
      setLoading(false)
    }
  }

  
function addVariantDraft() {
  setVariantDrafts(current => [
    ...current,
    {
      sku: '',
      barcode: '',
      size: '',
      color: '',
      purchase_cost: '0',
      sale_price: '',
      min_stock: '0',
    },
  ])
}

function duplicateVariantDraft(index: number) {
  setVariantDrafts(current => {
    const source = current[index]
    if (!source) return current

    const copy: VariantDraft = {
      ...source,
      sku: '',
      barcode: '',
    }

    return [...current, copy]
  })
}

function updateVariantDraft(
  index: number,
  field: keyof VariantDraft,
  value: string
) {
  setVariantDrafts(current =>
    current.map((variant, i) =>
      i === index ? { ...variant, [field]: value } : variant
    )
  )
}

function resetProductForm() {
  setSelectedImageFile(null)
  setImagePreviewUrl('')
  setExistingImageUrl('')
  setEditingProductId(null)
  setProductName('')
  setProductDescription('')
  setTargetAudience('women')
  setCategoryId('')
  setBrandId('')
  setVariantDrafts([{
    sku: '',
    barcode: '',
    size: '',
    color: '',
    purchase_cost: '0',
    sale_price: '',
    min_stock: '0',
  }])
  setShowProductForm(false)
}


async function openProductEditor(productId: string, duplicate = false) {
  if (!storeId) return

  setError('')
  setMessage('')
  setLoading(true)

  try {
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id,name,description,target_audience,category_id,brand_id,active,image_url')
      .eq('id', productId)
      .eq('store_id', storeId)
      .single()

    if (productError) throw productError

    const { data: variants, error: variantsError } = await supabase
      .from('product_variants')
      .select('id,sku,barcode,size,color,purchase_cost,sale_price,min_stock,active')
      .eq('product_id', productId)
      .eq('store_id', storeId)
      .order('sku')

    if (variantsError) throw variantsError

    setProductName(product.name ?? '')
    setProductDescription(product.description ?? '')
    setTargetAudience(product.target_audience ?? 'women')
    setCategoryId(product.category_id ?? '')
    setBrandId(product.brand_id ?? '')
    setSelectedImageFile(null)
    setImagePreviewUrl('')
    setExistingImageUrl(duplicate ? '' : (product.image_url ?? ''))

    setVariantDrafts((variants ?? []).map(variant => ({
      ...(duplicate ? {} : { id: variant.id }),
      sku: duplicate ? '' : (variant.sku ?? ''),
      barcode: duplicate ? '' : (variant.barcode ?? ''),
      size: variant.size ?? '',
      color: variant.color ?? '',
      purchase_cost: String(variant.purchase_cost ?? 0),
      sale_price: String(variant.sale_price ?? ''),
      min_stock: String(variant.min_stock ?? 0),
    })))

    setEditingProductId(duplicate ? null : product.id)
    if (duplicate) {
      setProductName(`${product.name} - Copie`)
    }
    setShowProductForm(true)
    setMessage(duplicate
      ? 'Copie préparée : vérifiez les SKU et codes-barres avant l’enregistrement.'
      : 'Produit chargé. Modifiez les champs puis enregistrez.')
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Impossible de charger le produit.')
  } finally {
    setLoading(false)
  }
}


async function archiveProduct(product: ProductRow) {
  if (!storeId || !user || !product.active) return

  const confirmed = window.confirm(
    `Archiver le produit « ${product.name} » ?\n\n` +
    "Le produit sera désactivé avec ses variantes. " +
    "L'historique des ventes et du stock sera conservé."
  )

  if (!confirmed) return

  setLoading(true)
  setError("")
  setMessage("")

  try {
    const { error: archiveError } = await supabase.rpc(
      "archive_product",
      {
        p_product_id: product.id,
        p_store_id: storeId,
      }
    )

    if (archiveError) {
      throw new Error(archiveError.message)
    }

    await loadProducts()
    setMessage(`Le produit « ${product.name} » a été archivé.`)
  } catch (err) {
    setError(
      err instanceof Error
        ? `Échec de l'archivage : ${err.message}`
        : "Impossible d'archiver le produit."
    )
  } finally {
    setLoading(false)
  }
}

async function restoreProduct(product: ProductRow) {
  if (!storeId || !user || product.active) return

  const confirmed = window.confirm(
    `Restaurer le produit « ${product.name} » ?\n\n` +
    "Le produit et ses variantes seront réactivés."
  )

  if (!confirmed) return

  setLoading(true)
  setError("")
  setMessage("")

  try {
    const { error: restoreError } = await supabase.rpc(
      "restore_product",
      {
        p_product_id: product.id,
        p_store_id: storeId,
      }
    )

    if (restoreError) throw restoreError

    await loadProducts()
    setMessage(`Le produit « ${product.name} » a été restauré.`)
  } catch (err) {
    setError(
      err instanceof Error
        ? `Échec de la restauration : ${err.message}`
        : "Impossible de restaurer le produit."
    )
  } finally {
    setLoading(false)
  }
}

async function saveProduct(event: FormEvent<HTMLFormElement>) {
  event.preventDefault()

  if (!user || !storeId) {
    setError('Connectez-vous et sélectionnez une boutique.')
    return
  }

  if (!productName.trim() || variantDrafts.length === 0) {
    setError('Le nom du produit et au moins une variante sont obligatoires.')
    return
  }

  const seenSkus = new Set<string>()
  const seenBarcodes = new Set<string>()

  for (const variant of variantDrafts) {
    const sku = variant.sku.trim()
    const barcode = variant.barcode.trim()
    const cost = Number(variant.purchase_cost)
    const price = Number(variant.sale_price)
    const minStock = Number(variant.min_stock)

    if (!sku || !variant.sale_price.trim()) {
      setError('Chaque variante doit avoir un SKU et un prix de vente.')
      return
    }

    if (
      !Number.isFinite(cost) || cost < 0 ||
      !Number.isFinite(price) || price < 0 ||
      !Number.isInteger(minStock) || minStock < 0
    ) {
      setError('Vérifiez les prix et le seuil de stock de chaque variante.')
      return
    }

    if (seenSkus.has(sku)) {
      setError(`Le SKU ${sku} est répété dans le formulaire.`)
      return
    }
    seenSkus.add(sku)

    if (barcode && seenBarcodes.has(barcode)) {
      setError(`Le code-barres ${barcode} est répété dans le formulaire.`)
      return
    }
    if (barcode) seenBarcodes.add(barcode)
  }

  setSavingProduct(true)
  setError('')
  setMessage('')


  try {
    const wasEditing = Boolean(editingProductId)
    let savedProductId: string

    const productPayload = {
      store_id: storeId,
      name: productName.trim(),
      description: productDescription.trim() || null,
      target_audience: targetAudience,
      category_id: categoryId || null,
      brand_id: brandId || null,
    }

    if (editingProductId) {
      const { data: updatedProduct, error: productError } = await supabase
        .from('products')
        .update(productPayload)
        .eq('id', editingProductId)
        .eq('store_id', storeId)
        .select('id')
        .single()

      if (productError) throw productError
      if (!updatedProduct) {
        throw new Error("Produit introuvable ou modification non autorisée.")
      }

      savedProductId = updatedProduct.id
    } else {
      const { data: newProduct, error: productError } = await supabase
        .from('products')
        .insert({ ...productPayload, active: true })
        .select('id')
        .single()

      if (productError) throw productError
      if (!newProduct) {
        throw new Error("La création du produit a échoué.")
      }

      savedProductId = newProduct.id
    }

    const variantPayload = (variant: VariantDraft) => ({
      store_id: storeId,
      product_id: savedProductId,
      sku: variant.sku.trim(),
      barcode: variant.barcode.trim() || null,
      size: variant.size.trim() || null,
      color: variant.color.trim() || null,
      purchase_cost: Number(variant.purchase_cost),
      sale_price: Number(variant.sale_price),
      min_stock: Number(variant.min_stock),
    })

    if (wasEditing) {
      // Mettre à jour les variantes existantes sans changer leurs IDs.
      for (const variant of variantDrafts.filter(v => v.id)) {
        const { data: updatedVariant, error: updateError } = await supabase
          .from('product_variants')
          .update(variantPayload(variant))
          .eq('id', variant.id!)
          .eq('store_id', storeId)
          .eq('product_id', savedProductId)
          .select('id')
          .maybeSingle()

        if (updateError) throw updateError
        if (!updatedVariant) {
          throw new Error(
            `Variante ${variant.sku} introuvable ou modification non autorisée.`
          )
        }
      }
    }

    // En mode création/duplication, toutes les variantes sont nouvelles.
    // En mode édition, seules les variantes sans ID sont insérées.
    const variantsToInsert = wasEditing
      ? variantDrafts.filter(v => !v.id)
      : variantDrafts

    if (variantsToInsert.length > 0) {
      const { error: variantError } = await supabase
        .from('product_variants')
        .insert(
          variantsToInsert.map(variant => ({
            ...variantPayload(variant),
            active: true,
          }))
        )

      if (variantError) {
        if (!wasEditing) {
          // Nettoyage du produit créé si l'insertion des variantes échoue.
          const { error: cleanupError } = await supabase
            .from('products')
            .delete()
            .eq('id', savedProductId)
            .eq('store_id', storeId)

          if (cleanupError) {
            throw new Error(
              `Variantes non enregistrées : ${variantError.message}. ` +
              `Nettoyage échoué : ${cleanupError.message}. ` +
              `Vérifiez le produit ${savedProductId}.`
            )
          }
        }

        throw variantError
      }
    }

    let imageWarning = ''

    if (selectedImageFile) {
      const extensionByType: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
      }
      const extension = extensionByType[selectedImageFile.type]

      if (!extension || selectedImageFile.size > 5 * 1024 * 1024) {
        imageWarning = ' Le produit est enregistré, mais la photo est invalide ou dépasse 5 Mo.'
      } else {
        const imagePath = `${storeId}/${savedProductId}.${extension}`
        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(imagePath, selectedImageFile, {
            upsert: true,
            contentType: selectedImageFile.type,
          })

        if (uploadError) {
          imageWarning =
            ` Le produit est enregistré, mais la photo n’a pas été téléversée : ${uploadError.message}. ` +
            'Vous pourrez réessayer en modifiant le produit.'
        } else {
          const { data: publicUrlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(imagePath)

          const { error: imageDbError } = await supabase
            .from('products')
            .update({ image_url: publicUrlData.publicUrl })
            .eq('id', savedProductId)
            .eq('store_id', storeId)

          if (imageDbError) {
            imageWarning =
              ` Le produit est enregistré, mais le lien de la photo n’a pas été sauvegardé : ${imageDbError.message}.`
          }
        }
      }
    }

    resetProductForm()
    setMessage(
      (wasEditing
        ? 'Produit et variantes modifiés avec succès.'
        : 'Produit et variantes enregistrés avec succès.') + imageWarning
    )

    await Promise.all([
      loadProducts(),
      loadProductOptions(),
    ])
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Impossible d’enregistrer le produit.'
    )
  } finally {
    setSavingProduct(false)
  }
}


  
const loadPromotions = useCallback(async () => {
  if (!storeId) {
    setPromotions([])
    setPromotionProductIdsByPromotion({})
    setPromotionLoading(false)
    return
  }

  setPromotionLoading(true)

  try {
    const { data, error: loadError } = await supabase
      .from('promotions')
      .select(
        'id,store_id,name,description,discount_type,discount_value,start_at,end_at,is_active,created_at'
      )
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })

    if (loadError) throw loadError

    const loadedPromotions = (data ?? []) as PromotionRow[]
    let grouped: Record<string, string[]> = {}

    if (loadedPromotions.length > 0) {
      const promotionIds = loadedPromotions.map(p => p.id)

      const { data: links, error: linksError } = await supabase
        .from('promotion_products')
        .select('promotion_id,product_id')
        .eq('store_id', storeId)
        .in('promotion_id', promotionIds)

      if (linksError) throw linksError

      for (const link of links ?? []) {
        const promotionId = String(link.promotion_id)
        const productId = String(link.product_id)

        if (!grouped[promotionId]) {
          grouped[promotionId] = []
        }

        if (!grouped[promotionId].includes(productId)) {
          grouped[promotionId].push(productId)
        }
      }
    }

    // Publier les deux états seulement après un chargement complet.
    setPromotions(loadedPromotions)
    setPromotionProductIdsByPromotion(grouped)
  } catch (err) {
    setPromotions([])
    setPromotionProductIdsByPromotion({})

    setError(
      `Chargement des promotions : ${
        err instanceof Error ? err.message : 'Erreur inattendue.'
      }`
    )
  } finally {
    setPromotionLoading(false)
  }
}, [storeId])


  useEffect(() => {
    if (user && storeId && ['promotions', 'sales'].includes(currentView)) {
      void loadPromotions()
    }
  }, [user, storeId, currentView, loadPromotions])

  function resetPromotionForm() {
    setPromotionEditingId(null)
    setPromotionName('')
    setPromotionDescription('')
    setPromotionType('percent')
    setPromotionValue('10')
    setPromotionStart('')
    setPromotionEnd('')
    setPromotionActive(false)
    setPromotionProductIds([])
    setPromotionSearch('')
  }

  async function savePromotion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!storeId) {
      setError('Sélectionnez une boutique avant de créer une promotion.')
      return
    }

    const value = Number(promotionValue)
    const start = new Date(promotionStart)
    const end = new Date(promotionEnd)

    if (!promotionName.trim()) {
      setError('Le nom de la promotion est obligatoire.')
      return
    }

    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      (promotionType === 'percent' && value > 100)
    ) {
      setError('Valeur de remise invalide.')
      return
    }

    if (
      !promotionStart ||
      !promotionEnd ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start
    ) {
      setError('Vérifiez les dates de début et de fin.')
      return
    }

    if (promotionProductIds.length === 0) {
      setError('Sélectionnez au moins un produit.')
      return
    }

    setPromotionSaving(true)
    setError('')
    setMessage('')

    try {
      const { data: promotionId, error: saveError } = await supabase.rpc(
        'save_promotion_with_products',
        {
          p_promotion_id: promotionEditingId,
          p_store_id: storeId,
          p_name: promotionName.trim(),
          p_description: promotionDescription.trim() || null,
          p_discount_type: promotionType,
          p_discount_value: value,
          p_start_at: start.toISOString(),
          p_end_at: end.toISOString(),
          p_is_active: promotionActive,
          p_product_ids: promotionProductIds,
        }
      )

      if (saveError) throw saveError

      if (!promotionId) {
        throw new Error(
          'La base de données n’a retourné aucun identifiant de promotion.'
        )
      }

      setMessage(
        promotionEditingId ? 'Promotion modifiée.' : 'Promotion créée.'
      )

      resetPromotionForm()
      await loadPromotions()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible d’enregistrer la promotion.'
      )
    } finally {
      setPromotionSaving(false)
    }
  }

  async function editPromotion(promotion: PromotionRow) {
    setError('')
    setMessage('')
    const { data, error: linksError } = await supabase
      .from('promotion_products')
      .select('product_id')
      .eq('promotion_id', promotion.id)
      .eq('store_id', storeId)

    if (linksError) {
      setError(`Chargement des produits de la promotion : ${linksError.message}`)
      return
    }

    const toLocalInput = (iso: string) => {
      const date = new Date(iso)
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      return local.toISOString().slice(0, 16)
    }

    setPromotionEditingId(promotion.id)
    setPromotionName(promotion.name)
    setPromotionDescription(promotion.description ?? '')
    setPromotionType(promotion.discount_type)
    setPromotionValue(String(promotion.discount_value))
    setPromotionStart(toLocalInput(promotion.start_at))
    setPromotionEnd(toLocalInput(promotion.end_at))
    setPromotionActive(promotion.is_active)
    setPromotionProductIds((data ?? []).map(row => row.product_id))
    setCurrentView('promotions')
  }

  async function togglePromotion(promotion: PromotionRow) {
    setError('')
    setMessage('')
    const { error: updateError } = await supabase
      .from('promotions')
      .update({ is_active: !promotion.is_active, updated_at: new Date().toISOString() })
      .eq('id', promotion.id)
      .eq('store_id', storeId)

    if (updateError) {
      setError(`Modification du statut : ${updateError.message}`)
      return
    }

    setMessage(promotion.is_active ? 'Promotion désactivée.' : 'Promotion activée.')
    await loadPromotions()
  }

  async function signOut() {
    setError('')
    const { error } = await supabase.auth.signOut()
    if (error) setError(error.message)
  }

  async function loadLabelVariants() {
  if (!storeId) {
    setLabelVariants([])
    setLabelError('Sélectionnez une boutique.')
    return
  }

  setLabelLoading(true)
  const QRCode = (await import('qrcode')).default
  setLabelError('')

  try {
    const { data, error } = await supabase
      .from('product_variants')
      .select('id,product_id,sku,barcode,qr_token,size,color,sale_price,active')
      .eq('store_id', storeId)
      .eq('active', true)
      .order('sku')

    if (error) throw error

    const activeProducts = new Set(
      products.filter(product => product.active).map(product => product.id)
    )

    const variants = ((data ?? []) as POSVariant[])
      .filter(variant => activeProducts.has(variant.product_id))

    setLabelVariants(variants)

    const images: Record<string, string> = {}
    for (const variant of variants) {
      const token = variant.qr_token || variant.sku
      if (!token) continue
      images[variant.id] = await QRCode.toDataURL(token, {
        width: 180,
        margin: 1,
        errorCorrectionLevel: 'M'
      })
    }
    setLabelImages(images)
  } catch (error) {
    setLabelError(
      error instanceof Error ? error.message : 'Impossible de charger les étiquettes.'
    )
  } finally {
    setLabelLoading(false)
  }
}


  async function createMobileScannerSession() {
    if (!user || !storeId || mobileBusy) return
    setMobileBusy(true)
    setError('')
    setScannerMessage('Création de la session mobile…')

    try {
      // Fermer proprement une éventuelle session précédente.
      if (mobileSession) await closeMobileScannerSession()

      const { data, error } = await supabase
        .from('mobile_scanner_sessions')
        .insert({ store_id: storeId, created_by: user.id })
        .select('id,session_token,expires_at')
        .single()

      if (error) throw error

      const session = data as {
        id: string
        session_token: string
        expires_at: string
      }

      const channel = supabase
        .channel(`mobile-scanner-${session.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'mobile_scanner_events',
            filter: `session_id=eq.${session.id}`,
          },
          (payload) => {
            const event = payload.new as {
              scanned_code?: string
              session_id?: string
            }
            if (event.session_id === session.id && event.scanned_code) {
              handleScannedCode(event.scanned_code)
            }
          }
        )

      mobileChannelRef.current = channel
      const subscription = await new Promise<string>((resolve) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve(status)
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            resolve(status)
          }
        })
      })

      if (subscription !== 'SUBSCRIBED') {
        await supabase.removeChannel(channel)
        mobileChannelRef.current = null
        await supabase
          .from('mobile_scanner_sessions')
          .update({ status: 'closed' })
          .eq('id', session.id)
        throw new Error('Realtime indisponible. Vérifiez la publication Supabase et les droits SELECT.')
      }

      const url = new URL(window.location.href)
      url.search = ''
      url.searchParams.set('mobileScanner', '1')
      url.searchParams.set('session', session.id)
      url.searchParams.set('token', session.session_token)

      const QRCode = (await import('qrcode')).default
      const dataUrl = await QRCode.toDataURL(url.toString(), {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'M',
      })

      setMobileSession(session)
      setMobileQr(dataUrl)
      setScannerMessage('Session mobile active. Scannez le QR avec votre téléphone.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création de session impossible.')
    } finally {
      setMobileBusy(false)
    }
  }

  async function closeMobileScannerSession() {
    const channel = mobileChannelRef.current
    mobileChannelRef.current = null
    if (channel) await supabase.removeChannel(channel)

    if (mobileSession) {
      const { error } = await supabase
        .from('mobile_scanner_sessions')
        .update({ status: 'closed' })
        .eq('id', mobileSession.id)

      if (error) setError(`Fermeture de session : ${error.message}`)
    }

    setMobileSession(null)
    setMobileQr('')
    setScannerMessage('Session mobile fermée.')
  }

  useEffect(() => {
    return () => {
      if (mobileChannelRef.current) {
        void supabase.removeChannel(mobileChannelRef.current)
        mobileChannelRef.current = null
      }
    }
  }, [])

  const [catalogueLayout, setCatalogueLayout] = useState<'grid' | 'table'>('table')

  const filteredProducts = products.filter(product => {
    const categoryName = categories.find(item => item.id === product.category_id)?.name ?? ''
    const brandName = brands.find(item => item.id === product.brand_id)?.name ?? ''
    const query = search.trim().toLocaleLowerCase()
    const searchableText = `${product.name} ${product.target_audience} ${categoryName} ${brandName}`.toLocaleLowerCase()
    return searchableText.includes(query)
  })

  if (!ready) {
    

  return (
      <main className="center">
        <RefreshCw className="spin" size={22} />
        <span>Préparation de votre espace…</span>
      </main>
    )
  }

  if (
    user &&
    new URLSearchParams(window.location.search).get('mobileScanner') === '1'
  ) {
    return (
      <MobileScanner
        userId={user.id}
        onClose={() => {
          window.location.href = window.location.pathname
        }}
      />
    )
  }

  return (
    <main
    className={`app ${dark ? 'dark' : ''}`}
  style={{
    '--primary': accentColors[accent].primary,
    '--primary-hover': accentColors[accent].hover,
  } as CSSProperties}
>
      <header className="topbar">
        <a className="brand" href="#" aria-label="StylePro Manager">
          <div className="brand-icon"><Shirt size={25} /></div>
          <div className="brand-copy">
            <strong>StylePro <span>Manager</span></strong>
            <small>FASHION RETAIL MANAGEMENT</small>
          </div>
        </a>

        <div className="header-actions">
          <span className="system-status">
            <span className="status-dot" /> Système opérationnel
          </span>
          <button
            className="icon-button"
            onClick={() => setThemeMode(dark ? 'light' : 'dark')}
            aria-label={dark ? 'Activer le mode clair' : 'Activer le mode sombre'}
            title={dark ? 'Mode clair' : 'Mode sombre'}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          {user && (
            <button className="secondary-button" onClick={signOut}>
              <LogOut size={17} /> <span>Déconnexion</span>
            </button>
          )}
        </div>
      </header>

      {!user ? (
        <section className="login-layout">
          <div className="login-presentation">
            <div className="presentation-badge">
              <ShieldCheck size={16} /> GESTION COMMERCIALE
            </div>
            <h1>Votre boutique.<br /><span>Votre réussite.</span></h1>
            <p>
              Gérez vos articles, votre stock et vos ventes depuis un espace
              professionnel conçu pour simplifier votre quotidien.
            </p>
            <div className="feature-list">
              <div><Package /><span><strong>Stock centralisé</strong><small>Articles, tailles et couleurs</small></span></div>
              <div><TrendingUp /><span><strong>Suivi commercial</strong><small>Indicateurs et performance</small></span></div>
              <div><LockKeyhole /><span><strong>Accès sécurisé</strong><small>Authentification Supabase</small></span></div>
            </div>
            <div className="presentation-footer">STYLEPRO MANAGER <span>•</span> ÉDITION BOUTIQUE</div>
          </div>

          <div className="login-side">
            <div className="auth-card">
              <div className="mobile-brand"><div className="brand-icon"><Shirt /></div><strong>StylePro Manager</strong></div>
              <div className="auth-heading-icon"><LockKeyhole size={23} /></div>
              <p className="eyebrow">ESPACE PRIVÉ</p>
              <h2>
                {authMode === 'login' ? 'Bon retour parmi nous' : authMode === 'forgot' ? 'Mot de passe oublié ?' : 'Créer un nouveau mot de passe'}
              </h2>
              <p className="auth-description">
                {authMode === 'login'
                  ? 'Connectez-vous pour accéder à votre espace de gestion.'
                  : authMode === 'forgot'
                    ? 'Saisissez votre adresse e-mail pour recevoir un lien sécurisé.'
                    : 'Choisissez un nouveau mot de passe pour votre compte.'}
              </p>

              {error && <div className="alert error"><AlertCircle size={18} />{error}</div>}
              {message && <div className="alert success">{message}</div>}

              <form onSubmit={submitAuth} className="form">
                {authMode !== 'reset' && (
                  <label>
                    Adresse e-mail
                    <div className="input-wrap">
                      <Users size={18} className="input-icon" />
                      <input
                        type={authMode === 'forgot' ? 'email' : 'text'}
                        autoComplete={authMode === 'forgot' ? 'email' : 'username'}
                        placeholder={authMode === 'login' ? 'admin ou vous@exemple.com' : 'vous@exemple.com'}
                        required
                        value={login}
                        onChange={event => setLogin(event.target.value)}
                      />
                    </div>
                  </label>
                )}

                {authMode !== 'forgot' && (
                  <label>
                    {authMode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}
                    <div className="input-wrap">
                      <LockKeyhole size={18} className="input-icon" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        minLength={authMode === 'reset' ? 8 : undefined}
                        autoComplete={authMode === 'reset' ? 'new-password' : 'current-password'}
                        placeholder={authMode === 'reset' ? 'Minimum 8 caractères' : 'Saisissez votre mot de passe'}
                        required
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword(value => !value)}
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </label>
                )}

                {authMode === 'reset' && (
                  <label>
                    Confirmer le nouveau mot de passe
                    <div className="input-wrap">
                      <LockKeyhole size={18} className="input-icon" />
                      <input
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                        value={confirmPassword}
                        onChange={event => setConfirmPassword(event.target.value)}
                        placeholder="Répétez le nouveau mot de passe"
                      />
                    </div>
                  </label>
                )}

                <button className="primary-button login-submit" disabled={loading}>
                  {loading
                    ? <><RefreshCw size={18} className="spin" /> Traitement en cours…</>
                    : <>{authMode === 'login' ? 'Se connecter' : authMode === 'forgot' ? 'Envoyer le lien' : 'Enregistrer le mot de passe'} <ChevronRight size={18} /></>}
                </button>
              </form>

              <div className="auth-switch">
                <button type="button" onClick={() => {
                  setAuthMode(authMode === 'login' ? 'forgot' : 'login')
                  setError('')
                  setMessage('')
                  setPassword('')
                  setConfirmPassword('')
                }}>
                  {authMode === 'login' ? 'Mot de passe oublié ?' : 'Retour à la connexion'}
                </button>
              </div>
              <div className="auth-security"><ShieldCheck size={16} /> Connexion sécurisée par Supabase</div>
            </div>
          </div>
        </section>
      ) : (
        <div className="workspace">
          <aside className="sidebar">
            
            <p className="sidebar-caption">VOTRE ESPACE</p>

            <p className="sidebar-group-label">GÉNÉRAL</p>
            <button type="button" className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}>
              <LayoutDashboard size={19} /> <span>Tableau de bord</span>
            </button>

            <p className="sidebar-group-label">BOUTIQUE</p>
            <button type="button" className={`nav-item ${currentView === 'catalogue' ? 'active' : ''}`} onClick={() => setCurrentView('catalogue')}>
              <Shirt size={19} /> <span>Catalogue articles</span>
            </button>
            <button
  type="button"
  className={`nav-item ${currentView === 'atelier' ? 'active' : ''}`}
  onClick={() => {
    setCurrentView('atelier')
    setError('')
    setMessage('')
  }}
>
  <Factory size={19} />
  <span>Atelier / Production</span>
</button>
            <button type="button" className={`nav-item ${currentView === 'promotions' ? 'active' : ''}`} onClick={() => { setCurrentView('promotions'); setError(''); setMessage('') }}>
              <Tag size={19} /> <span>Promotions</span>
            </button>
            <button type="button" className={`nav-item ${currentView === 'labels' ? 'active' : ''}`} onClick={() => { setCurrentView('labels'); void loadLabelVariants() }}>
              <QrCode size={19} /> <span>Étiquettes QR</span>
            </button>

            <p className="sidebar-group-label">GESTION COMMERCIALE</p>
            <button type="button" className={`nav-item ${currentView === 'livraisons' ? 'active' : ''}`} onClick={() => { setCurrentView('livraisons'); setError(''); setMessage('') }}>
              <Truck size={19} /> <span>Livraisons</span>
            </button>
            <button type="button" className={`nav-item ${currentView === 'stock' ? 'active' : ''}`} onClick={() => setCurrentView('stock')}>
              <Boxes size={19} /> <span>Gestion du stock</span>
            </button>
            <button type="button" className={`nav-item ${currentView === 'sales' ? 'active' : ''}`} onClick={() => setCurrentView('sales')}>
              <ShoppingCart size={19} /> <span>Ventes / Caisse</span>
            </button>
            <button type="button" className={`nav-item ${currentView === 'returns' ? 'active' : ''}`} onClick={() => { setCurrentView('returns'); setError(''); setMessage('') }}>
              <RotateCcw size={19} /> <span>Retours / Remboursements</span>
            </button>
            <button type="button" className={`nav-item ${currentView === 'customers' ? 'active' : ''}`} onClick={() => setCurrentView('customers')}>
              <Users size={19} /> <span>Clients</span>
            </button>

            <p className="sidebar-group-label">ANALYSE</p>
            <button type="button" className={`nav-item ${currentView === 'statistics' ? 'active' : ''}`} onClick={() => setCurrentView('statistics')}>
              <TrendingUp size={19} /> <span>Statistiques</span>
            </button>

            <button
              type="button"
              className={`nav-bottom settings-nav ${currentView === 'settings' ? 'selected' : ''}`}
              onClick={() => setCurrentView('settings')}
            >
              <Settings size={18} />
              <span>Paramètres</span>
              <ChevronRight size={15} className={currentView === 'settings' ? 'rotate-chevron' : ''} />
            </button>

            <div className="sidebar-user">
              <div className="avatar">{(user.email?.[0] ?? 'A').toUpperCase()}</div>
              <div className="sidebar-user-info">
                <strong>Compte connecté</strong>
                <small>{user.email}</small>
              </div>
            </div>

          </aside>

          <section className="dashboard-content">
            {error && <div className="alert error"><AlertCircle size={18} />{error}</div>}
            {message && <div className="alert success">{message}</div>}

            {currentView === 'settings' ? (
              <div className="settings-page">
                <div className="welcome">
                  <div>
                    <p className="eyebrow">CONFIGURATION</p>
                    <h1>Paramètres</h1>
                    <p className="muted">Personnalisez l'apparence et consultez les informations de votre espace.</p>
                  </div>
                  <div className="secure-label"><ShieldCheck size={17} /> Préférences locales</div>
                </div>

                <section className="panel appearance-panel">
                  <div className="panel-title">
                    <Settings size={21} />
                    <div>
                      <h2>Thème & Apparence</h2>
                      <p>Choisissez le mode d'affichage et la couleur principale de l'interface.</p>
                    </div>
                  </div>
                  <label className="field appearance-field">
                    Thème de l'interface
                    <select value={themeMode} onChange={event => setThemeMode(event.target.value as ThemeMode)}>
                      <option value="light">Clair — Beige</option>
                      <option value="dark">Sombre</option>
                      <option value="system">Système — automatique</option>
                    </select>
                  </label>
                  <p className="palette-label">Couleur principale</p>
                  <div className="palette-options">
                    {([
                      ['beige', '#a9875b', 'Beige'],
                      ['green', '#397568', 'Vert'],
                      ['blue', '#466b9d', 'Bleu'],
                      ['burgundy', '#914c60', 'Bordeaux'],
                      ['slate', '#626b78', 'Gris ardoise'],
                    ] as const).map(([value, color, label]) => (
                      <button type="button" key={value}
                        className={`palette-choice ${accent === value ? 'chosen' : ''}`}
                        onClick={() => setAccent(value)}
                        aria-label={`Choisir la couleur ${label}`} title={label}>
                        <span style={{ backgroundColor: color }} />
                        {accent === value && <span className="palette-check">✓</span>}
                        <small>{label}</small>
                      </button>
                    ))}
                  </div>
                  <div className="settings-actions">
                    <button type="button" className="secondary-button" onClick={() => { setThemeMode('light'); setAccent('beige') }}>
                      Réinitialiser l'apparence
                    </button>
                    <p className="appearance-note">Les préférences sont enregistrées automatiquement dans ce navigateur.</p>
                  </div>
                </section>

                <section className="panel settings-info-grid">
                  <div>
                    <div className="panel-title"><Store size={20} /><div><h2>Boutique active</h2><p>Contexte actuellement sélectionné.</p></div></div>
                    <strong>{stores.find(item => item.id === storeId)?.name || storeName || 'Aucune boutique sélectionnée'}</strong>
                    <p className="muted">Devise : {stores.find(item => item.id === storeId)?.currency || 'DZD'}</p>
                  </div>
                  <div>
                    <div className="panel-title"><ShieldCheck size={20} /><div><h2>Compte connecté</h2><p>Session authentifiée.</p></div></div>
                    <strong>{user.email || 'Compte utilisateur'}</strong>
                    <p className="muted">Les accès aux données restent contrôlés par les politiques RLS de Supabase.</p>
                  </div>
                </section>
                <div className="alert info"><AlertCircle size={18} /> Les réglages de thème sont stockés sur cet appareil. Les paramètres métier et les permissions nécessitent une validation du schéma Supabase avant toute modification.</div>
              </div>
            ) : currentView === 'atelier' ? (
  <AtelierModule storeId={storeId} userId={user.id} />
) : currentView === 'livraisons' ? (
              <LivraisonModule storeId={storeId} userId={user.id} />
            ) : currentView === 'stock' ? (
              <section className="panel">
                <div className="panel-heading">
                  <form className="form-grid" onSubmit={saveStockMovement}>
  <h3 style={{ gridColumn: '1 / -1' }}>Nouveau mouvement de stock</h3>

  <label>
  Emplacement
  <select
    value={stockLocation}
    onChange={e =>
      setStockLocation(e.target.value as 'boutique' | 'reserve')
    }
  >
    <option value="boutique">🏪 Stock Boutique</option>
    <option value="reserve">📦 Stock Réserve</option>
  </select>
</label>

  <label>Article
    <select
      required
      value={movementVariant}
      onChange={e => setMovementVariant(e.target.value)}
    >
      <option value="">Choisir un article</option>
      {posVariants.map(v => (
        <option key={v.id} value={v.id}>
          {products.find(p => p.id === v.product_id)?.name ?? v.sku}
          {' — '}{v.sku}
          {' (Stock '}{stockLocation === 'boutique' ? 'Boutique: ' : 'Réserve: '}{stockByLocation[v.id]?.[stockLocation] ?? 0}{')'}
        </option>
      ))}
    </select>
  </label>

  <label>Type
    <select
      value={movementType}
      onChange={e => setMovementType(e.target.value as 'in' | 'out' | 'adjustment')}
    >
      <option value="in">Entrée</option>
      <option value="out">Sortie</option>
      <option value="adjustment">Correction inventaire</option>
    </select>
  </label>

  <label>{movementType === 'adjustment' ? 'Quantité réelle' : 'Quantité'}
    <input
      type="number"
      min={movementType === 'adjustment' ? '0' : '1'}
      step="1"
      required
      value={movementQty}
      onChange={e => setMovementQty(e.target.value)}
    />
  </label>

  <label>Coût unitaire (DZD)
    <input
      type="number"
      min="0"
      step="0.01"
      value={movementCost}
      onChange={e => setMovementCost(e.target.value)}
    />
  </label>

  <label style={{ gridColumn: '1 / -1' }}>Motif
    <input
      value={movementReason}
      onChange={e => setMovementReason(e.target.value)}
      placeholder="Réception, retour, inventaire..."
    />
  </label>

  <button type="submit" className="primary-button" disabled={movementBusy}>
    {movementBusy ? 'Enregistrement...' : 'Enregistrer le mouvement'}
  </button>
  </form>

<div className="stock-transfer-section">
  <h3>⇄ Transfert entre emplacements</h3>

  <form className="form-grid" onSubmit={saveStockTransfer}>
    <label>
      Article
      <select
        required
        value={transferVariant}
        onChange={e => setTransferVariant(e.target.value)}
      >
        <option value="">Choisir un article</option>
        {posVariants.map(v => (
          <option key={v.id} value={v.id}>
            {products.find(p => p.id === v.product_id)?.name ?? v.sku}
            {' — '}{v.sku}
            {' | Boutique : '}{stockByLocation[v.id]?.boutique ?? 0}
            {' | Réserve : '}{stockByLocation[v.id]?.reserve ?? 0}
          </option>
        ))}
      </select>
    </label>

    <label>
      Source
      <select
        value={transferFrom}
        onChange={e => {
          const value = e.target.value as 'boutique' | 'reserve'
          setTransferFrom(value)
          setTransferTo(value === 'boutique' ? 'reserve' : 'boutique')
        }}
      >
        <option value="boutique">🏪 Boutique</option>
        <option value="reserve">📦 Réserve</option>
      </select>
    </label>

    <label>
      Destination
      <select
        value={transferTo}
        onChange={e =>
          setTransferTo(e.target.value as 'boutique' | 'reserve')
        }
      >
        <option value="boutique">🏪 Boutique</option>
        <option value="reserve">📦 Réserve</option>
      </select>
    </label>

    <label>
      Quantité
      <input
        type="number"
        min="1"
        step="1"
        required
        value={transferQty}
        onChange={e => setTransferQty(e.target.value)}
      />
    </label>

    <label>
      Motif
      <input
        value={transferReason}
        onChange={e => setTransferReason(e.target.value)}
        placeholder="Réapprovisionnement boutique..."
      />
    </label>

    {transferVariant && (
      <div style={{ gridColumn: '1 / -1' }}>
        <p>Boutique : <strong>{stockByLocation[transferVariant]?.boutique ?? 0}</strong></p>
        <p>Réserve : <strong>{stockByLocation[transferVariant]?.reserve ?? 0}</strong></p>
        <p>Disponible à la source : <strong>{stockByLocation[transferVariant]?.[transferFrom] ?? 0}</strong></p>
      </div>
    )}

    <button
      type="submit"
      className="primary-button"
      disabled={transferBusy || !transferVariant}
    >
      {transferBusy ? 'Transfert en cours...' : '⇄ Confirmer le transfert'}
    </button>
  </form>
</div>

<div className="movement-history-section">

  <div className="movement-history-heading">
    <div>
      <h3>Historique des mouvements</h3>
      <p>
        {movementHistory.length} mouvement(s) enregistré(s)
      </p>
    </div>

    <button
      type="button"
      className="secondary-button"
      onClick={exportMovementHistoryPDF}
      disabled={movementHistory.length === 0}
    >
      Exporter PDF
    </button>
  </div>

  <div className="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Variation</th>
          <th>Motif</th>
        </tr>
      </thead>

      <tbody>
        {movementHistory.length === 0 ? (
          <tr>
            <td colSpan={4} style={{ textAlign: 'center', padding: '24px' }}>
              Aucun mouvement enregistré.
            </td>
          </tr>
        ) : (
          (historyExpanded
            ? movementHistory
            : movementHistory.slice(0, 6)
          ).map(m => (
            <tr key={m.id}>
              <td>{new Date(m.created_at).toLocaleString('fr-DZ')}</td>
              <td>{m.movement_type}</td>
              <td>
                {Number(m.quantity_delta) > 0 ? '+' : ''}
                {m.quantity_delta}
              </td>
              <td>{m.reason || '—'}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>

  {movementHistory.length > 6 && (
    <button
      type="button"
      className="secondary-button"
      onClick={() => setHistoryExpanded(value => !value)}
      style={{ marginTop: '12px' }}
    >
      {historyExpanded
        ? 'Réduire ▲'
        : `Afficher plus (${movementHistory.length - 6} autres) ▼`
      }
    </button>
  )}

</div>
                  <div className="panel-title"><Package size={22}/><div><h2>Gestion du stock</h2><p>Quantités calculées depuis les mouvements enregistrés.</p></div></div>
                  <button type="button" className="secondary-button" onClick={() => void Promise.all([loadPOSData(), loadMovementHistory()]).catch(e => setError(e instanceof Error ? e.message : String(e)))}><RefreshCw size={16}/> Actualiser</button>
                </div>
                
<div className="stock-summary-grid">
  <div className="stat-card">
    <span>Unités disponibles en boutique</span>
    <strong>{stockSummary.totalUnits.toLocaleString('fr-DZ')}</strong>
  </div>
  <div className="stat-card">
    <span>Valeur du stock boutique</span>
    <strong>{stockSummary.stockValue.toLocaleString('fr-DZ', {
      maximumFractionDigits: 2
    })} DZD</strong>
    <small>Au coût d'achat actuel</small>
  </div>
  <div className="stat-card">
    <span>Stock faible en boutique</span>
    <strong>{stockSummary.lowStock}</strong>
  </div>
  <div className="stat-card">
    <span>Rupture en boutique</span>
    <strong>{stockSummary.outOfStock}</strong>
  </div>
</div>

<div className="stock-insights-grid">
  {(() => {
    const boutiqueUnits = Object.values(stockByLocation).reduce((sum, item) => sum + item.boutique, 0)
    const reserveUnits = Object.values(stockByLocation).reduce((sum, item) => sum + item.reserve, 0)
    const total = Math.max(1, boutiqueUnits + reserveUnits)
    const statusTotal = Math.max(1, stockSummary.outOfStock + stockSummary.lowStock + stockSummary.available)
    return (
      <>
        <section className="stock-insight-card">
          <div className="stock-insight-heading">
            <div><span className="stock-insight-kicker">RÉPARTITION</span><h3>Stock par emplacement</h3></div>
            <Boxes size={19} />
          </div>
          <div className="stock-location-bars">
            <div className="stock-location-row">
              <div><span>🏪 Boutique</span><strong>{boutiqueUnits.toLocaleString('fr-DZ')}</strong></div>
              <div className="stock-insight-track"><span style={{ width: `${boutiqueUnits / total * 100}%` }} /></div>
            </div>
            <div className="stock-location-row">
              <div><span>📦 Réserve</span><strong>{reserveUnits.toLocaleString('fr-DZ')}</strong></div>
              <div className="stock-insight-track reserve"><span style={{ width: `${reserveUnits / total * 100}%` }} /></div>
            </div>
            <p className="stock-insight-footnote">{(boutiqueUnits + reserveUnits).toLocaleString('fr-DZ')} unité(s) au total dans les deux emplacements.</p>
          </div>
        </section>
        <section className="stock-insight-card">
          <div className="stock-insight-heading">
            <div><span className="stock-insight-kicker">DISPONIBILITÉ BOUTIQUE</span><h3>État des références</h3></div>
            <Activity size={19} />
          </div>
          <div className="stock-status-bars">
            {[
              { label: 'Disponibles', value: stockSummary.available, kind: 'ok' },
              { label: 'Stock faible', value: stockSummary.lowStock, kind: 'low' },
              { label: 'En rupture', value: stockSummary.outOfStock, kind: 'out' },
            ].map(item => (
              <div className="stock-status-row" key={item.kind}>
                <div><span>{item.label}</span><strong>{item.value}</strong></div>
                <div className={`stock-insight-track ${item.kind}`}><span style={{ width: `${item.value / statusTotal * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      </>
    )
  })()}
</div>

<div className="stock-toolbar">
  <input
    type="search"
    value={stockSearch}
    onChange={e => setStockSearch(e.target.value)}
    placeholder="Rechercher un article, SKU, taille, couleur..."
    aria-label="Rechercher dans le stock"
  />

  <select
    value={stockFilter}
    onChange={e => setStockFilter(
      e.target.value as 'all' | 'low' | 'out' | 'available'
    )}
    aria-label="Filtrer le stock"
  >
    <option value="all">Tous les articles</option>
    <option value="low">Stock faible</option>
    <option value="out">En rupture</option>
    <option value="available">Disponibles</option>
  </select>
</div>

<div className="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Article</th>
        <th>SKU</th>
        <th>Code-barres</th>
        <th>Taille</th>
        <th>Couleur</th>
        <th>Prix de vente</th>
        <th>Coût d'achat</th>
        <th>Boutique</th>
        <th>Réserve</th>
        <th>Total</th>
        <th>Stock minimum</th>
        <th>Statut</th>
      </tr>
    </thead>
    <tbody>
    {filteredStockVariants.map(v => {
  const product = products.find(p => p.id === v.product_id)

  const boutiqueQty = stockByLocation[v.id]?.boutique ?? 0
  const reserveQty = stockByLocation[v.id]?.reserve ?? 0
  const totalQty = boutiqueQty + reserveQty

  const qty = boutiqueQty
  const minimum = Number(v.min_stock ?? 0)

  const isOut = qty <= 0
  const isLow = !isOut && qty <= minimum

  return (
    <tr key={v.id}>
    <td>{product?.name ?? 'Article'}</td>
    <td>{v.sku}</td>
    <td>{v.barcode || '—'}</td>
    <td>{v.size || '—'}</td>
    <td>{v.color || '—'}</td>
  
    <td>{Number(v.sale_price).toLocaleString('fr-DZ')} DZD</td>
    <td>{Number(v.purchase_cost).toLocaleString('fr-DZ')} DZD</td>
  
    <td><strong>{boutiqueQty}</strong></td>
    <td><strong>{reserveQty}</strong></td>
    <td><strong>{totalQty}</strong></td>
  
    <td>{minimum}</td>
  
    <td>
      <span className={
        isOut
          ? 'stock-status stock-out'
          : isLow
            ? 'stock-status stock-low'
            : 'stock-status stock-ok'
      }>
        {isOut ? 'Rupture' : isLow ? 'Stock faible' : 'Disponible'}
      </span>
    </td>
  </tr>
        )
      })}
      {filteredStockVariants.length === 0 && (
        <tr>
          <td colSpan={12} style={{ textAlign: 'center', padding: 24 }}>
            Aucun article ne correspond aux filtres.
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>

            
</section>
            ) : currentView === 'labels' ? (
  <section className="panel label-page">
    <div className="label-hero">
      <div className="label-hero-icon"><Package size={25} /></div>
      <div className="label-hero-copy">
        <h2>Étiquettes QR</h2>
        <p>Préparez et imprimez les étiquettes de vos articles.</p>
      </div>
      <div className="label-count">
        <strong>{selectedLabelIds.length}</strong>
        <span>sélectionnée(s)</span>
      </div>
    </div>

    {labelError && <div className="label-alert">{labelError}</div>}
    {labelLoading && <div className="label-loading">Chargement des variantes...</div>}

    <div className="label-toolbar">
      <div className="label-search-wrap">
        <Search size={18} />
        <input
          type="search"
          value={labelSearch}
          onChange={e => setLabelSearch(e.target.value)}
          placeholder="Rechercher un article, SKU, taille..."
          aria-label="Rechercher une variante"
        />
        {labelSearch && (
          <button type="button" className="label-clear-btn" onClick={() => setLabelSearch('')}>
            Effacer
          </button>
        )}
      </div>
      <div className="label-toolbar-actions">
        
<button
  type="button"
  className="label-btn label-btn-light"
  onClick={() => {
    const q = labelSearch.trim().toLowerCase()
    const visibleIds = labelVariants.filter(v => {
      const product = products.find(p => p.id === v.product_id)
      return !q || [product?.name, v.sku, v.barcode, v.size, v.color]
        .some(x => String(x ?? '').toLowerCase().includes(q))
    }).map(v => v.id)

    setSelectedLabelIds(old =>
      visibleIds.every(id => old.includes(id))
        ? old.filter(id => !visibleIds.includes(id))
        : [...new Set([...old, ...visibleIds])]
    )
  }}
>
  <CheckSquare size={17} /> Sélectionner / désélectionner visibles
</button>
<button
  type="button"
  className="label-btn label-btn-light"
  onClick={() => setSelectedLabelIds([])}
>
  <Square size={17} /> Tout désélectionner
</button>

        <button
          type="button"
          className="label-btn label-btn-primary"
          disabled={selectedLabelIds.length === 0 || labelLoading}
          onClick={() => {
            document.documentElement.dataset.labelPaper = labelPaperSize
            document.documentElement.style.setProperty(
              '--label-print-columns',
              String(labelColumns)
            )
            window.print()
          }}
        >
          <Printer size={17} /> Imprimer la sélection ({selectedLabelIds.length})
        </button>
      </div>
    </div>

    <div className="label-print-settings">
      <label>Format d'impression
        <select
  value={labelPaperSize}
  onChange={e => {
    const value = e.target.value
    if (value === 'A4' || value === '50x30' || value === '70x40') {
      setLabelPaperSize(value)
    }
  }}
>
          <option value="A4">A4</option>
          <option value="50x30">Étiquette 50 × 30 mm</option>
          <option value="70x40">Étiquette 70 × 40 mm</option>
        </select>
      </label>

      <label>Colonnes A4
        <select value={labelColumns} onChange={e => setLabelColumns(Number(e.target.value))}>
          <option value={2}>2 colonnes</option>
          <option value={3}>3 colonnes</option>
          <option value={4}>4 colonnes</option>
        </select>
      </label>

      <label>Copies par article
        <input
          type="number"
          min={1}
          max={100}
          value={labelCopies}
          onChange={e => setLabelCopies(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
        />
      </label>

      <div className="label-print-toggles">
        <span>Informations à afficher</span>
        <label><input type="checkbox" checked={showLabelName} onChange={e => setShowLabelName(e.target.checked)} /> Nom</label>
        <label><input type="checkbox" checked={showLabelSku} onChange={e => setShowLabelSku(e.target.checked)} /> Référence</label>
        <label><input type="checkbox" checked={showLabelPrice} onChange={e => setShowLabelPrice(e.target.checked)} /> Prix</label>
        <label><input type="checkbox" checked={showLabelColor} onChange={e => setShowLabelColor(e.target.checked)} /> Couleur</label>
        <label><input type="checkbox" checked={showLabelSize} onChange={e => setShowLabelSize(e.target.checked)} /> Taille</label>
      </div>
    </div>

    <section className="label-live-preview">
      <div className="label-preview-heading">
        <div>
          <span className="label-preview-eyebrow">APERÇU EN DIRECT</span>
          <h3>Aperçu avant impression</h3>
          <p>Prévisualisation selon le format et les informations choisis.</p>
        </div>
        <span className="label-preview-format">
          {labelPaperSize === 'A4' ? 'Feuille A4' : `${labelPaperSize.replace('x', ' × ')} mm`}
        </span>
      </div>

      {(() => {
        const previewId = selectedLabelIds[0]
        const v = labelVariants.find(item => item.id === previewId)
        const product = v ? products.find(item => item.id === v.product_id) : undefined
        return v ? (
          <div className={`label-preview-stage label-preview-${labelPaperSize}`}>
            <article className="label-preview-card">
              <div className="label-preview-qr">
                {labelImages[v.id] ? (
                  <img src={labelImages[v.id]} alt={`Aperçu QR ${v.sku}`} />
                ) : (
                  <span>QR indisponible</span>
                )}
              </div>
              <div className="label-preview-info">
                {showLabelName && <strong>{product?.name ?? 'Article'}</strong>}
                {showLabelSku && <span>Réf. {v.sku}</span>}
                {showLabelColor && v.color && <span>Couleur : {v.color}</span>}
                {showLabelSize && v.size && <span>Taille : {v.size}</span>}
                {showLabelPrice && (
                  <b>{Number(v.sale_price).toLocaleString('fr-DZ', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })} DA</b>
                )}
              </div>
            </article>
          </div>
        ) : (
          <div className="label-preview-empty">
            Sélectionnez une étiquette dans la liste pour voir son aperçu ici.
          </div>
        )
      })()}

      
{(() => {
  const totalLabels = selectedLabelIds.reduce(
    (total, id) => total + (labelCopiesByVariant[id] ?? labelCopies),
    0
  )
  const estimatedA4Sheets = Math.ceil(totalLabels / (labelColumns * 8))

  return (
    <div className="label-print-summary">
      <div className="label-summary-item">
        <span>Variantes sélectionnées</span>
        <strong>{selectedLabelIds.length}</strong>
      </div>
      <div className="label-summary-item">
        <span>Total étiquettes</span>
        <strong>{totalLabels}</strong>
      </div>
      {labelPaperSize === 'A4' && (
        <div className="label-summary-item">
          <span>Feuilles A4 estimées</span>
          <strong>{totalLabels ? estimatedA4Sheets : 0}</strong>
        </div>
      )}
      {labelPaperSize !== 'A4' && (
        <div className="label-summary-item">
          <span>Format choisi</span>
          <strong>{labelPaperSize.replace('x', ' × ')} mm</strong>
        </div>
      )}
    </div>
  )
})()}

    </section>

    <div className="label-results-heading">
      <span>{labelVariants.filter(v => {
        const product = products.find(p => p.id === v.product_id)
        const q = labelSearch.trim().toLowerCase()
        return !q || [product?.name, v.sku, v.barcode, v.size, v.color]
          .some(x => String(x ?? '').toLowerCase().includes(q))
      }).length} variante(s)</span>
      <span>Cliquez sur une carte pour la sélectionner</span>
    </div>

    <div className="label-grid">
      {labelVariants
        .filter(v => {
          const product = products.find(p => p.id === v.product_id)
          const q = labelSearch.trim().toLowerCase()
          return !q || [product?.name, v.sku, v.barcode, v.size, v.color]
            .some(x => String(x ?? '').toLowerCase().includes(q))
        })
        .map(v => {
          const product = products.find(p => p.id === v.product_id)
          const selected = selectedLabelIds.includes(v.id)
          return (
            <article
              className={`qr-label ${selected ? 'qr-label-selected' : ''}`}
              key={v.id}
              onClick={() => setSelectedLabelIds(old =>
                selected ? old.filter(id => id !== v.id) : [...old, v.id]
              )}
            >
              <div className="qr-card-top">
                <span className={`qr-selection-mark ${selected ? 'checked' : ''}`}>
                  {selected ? <Check size={14} /> : null}
                </span>
                <span className="qr-card-tag">{selected ? 'Sélectionné' : 'Étiquette QR'}</span>
              </div>
              <div className="qr-code-frame">
                {labelImages[v.id] ? (
                  <img src={labelImages[v.id]} alt={`QR ${v.sku}`} />
                ) : (
                  <div className="qr-placeholder">QR indisponible</div>
                )}
              </div>
              <strong className="qr-product-name">{product?.name ?? 'Article'}</strong>
              <span className="qr-sku">Réf. {v.sku}</span>
              {(v.size || v.color) && (
                <div className="qr-variant-details">
                  {v.size && <span>{v.size}</span>}
                  {v.color && <span>{v.color}</span>}
                </div>
              )}
              <div className="qr-price">{Number(v.sale_price).toLocaleString('fr-DZ', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })} <small>DA</small></div>
              
              
<div
  className="qr-card-copies"
  onClick={e => e.stopPropagation()}
>
  <span>Copies</span>
  <div className="qr-copies-control">
    <button
      type="button"
      className="qr-copies-btn"
      aria-label={`Diminuer les copies pour ${v.sku}`}
      disabled={(labelCopiesByVariant[v.id] ?? labelCopies) <= 1}
      onClick={() => setLabelCopiesByVariant(old => ({
        ...old,
        [v.id]: Math.max(1, (old[v.id] ?? labelCopies) - 1)
      }))}
    >
      −
    </button>
    <input
      type="number"
      min={1}
      max={100}
      value={labelCopiesByVariant[v.id] ?? labelCopies}
      onClick={e => e.stopPropagation()}
      onChange={e => {
        const value = Math.max(1, Math.min(100, Number(e.target.value) || 1))
        setLabelCopiesByVariant(old => ({ ...old, [v.id]: value }))
      }}
      aria-label={`Nombre de copies pour ${v.sku}`}
    />
    <button
      type="button"
      className="qr-copies-btn"
      aria-label={`Augmenter les copies pour ${v.sku}`}
      disabled={(labelCopiesByVariant[v.id] ?? labelCopies) >= 100}
      onClick={() => setLabelCopiesByVariant(old => ({
        ...old,
        [v.id]: Math.min(100, (old[v.id] ?? labelCopies) + 1)
      }))}
    >
      +
    </button>
  </div>
</div>

            </article>
          )
        })}
    </div>

    <div className="label-print-only-grid">
      {selectedLabelIds.flatMap(id => {
        const v = labelVariants.find(item => item.id === id)
        if (!v) return []
        const product = products.find(item => item.id === v.product_id)

        return Array.from({ length: labelCopiesByVariant[v.id] ?? labelCopies }, (_, copyIndex) => (
          <article className="qr-label qr-label-print" key={`${v.id}-${copyIndex}`}>
            <div className="qr-code-frame">
              {labelImages[v.id] ? (
                <img src={labelImages[v.id]} alt={`QR ${v.sku}`} />
              ) : (
                <div className="qr-placeholder">QR indisponible</div>
              )}
            </div>
            {showLabelName && (
              <strong className="qr-product-name">{product?.name ?? 'Article'}</strong>
            )}
            {showLabelSku && <span className="qr-sku">Réf. {v.sku}</span>}
            {(showLabelSize && v.size) || (showLabelColor && v.color) ? (
              <div className="qr-variant-details">
                {showLabelSize && v.size && <span>{v.size}</span>}
                {showLabelColor && v.color && <span>{v.color}</span>}
              </div>
            ) : null}
            {showLabelPrice && (
              <div className="qr-price">
                {Number(v.sale_price).toLocaleString('fr-DZ', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })} <small>DA</small>
              </div>
            )}
          </article>
        ))
      })}
    </div>

    {!labelLoading && labelVariants.length === 0 && !labelError && (
      <div className="label-empty">
        <Package size={32} />
        <strong>Aucune variante disponible</strong>
        <span>Ajoutez des variantes actives dans le catalogue.</span>
      </div>
    )}
  </section>
) : currentView === 'sales' ? (
              <section className="panel pos-panel">
                <div className="panel-heading">
                  <div className="panel-title"><ShoppingBag size={22}/><div><h2>Ventes / Caisse</h2><p>Ajoutez les articles puis validez la vente.</p></div></div>
                  <button type="button" className="secondary-button" onClick={() => void loadPOSData().catch(e => setError(e.message))} disabled={posBusy}><RefreshCw size={16}/> Actualiser</button>
                </div>
                {lastReceipt && (
                  <div className="alert success sales-receipt-alert">
                    <div>
                      <strong>Facture #{lastReceipt.sale_number}</strong>
                      <span> — {lastReceipt.total.toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD</span>
                    </div>
                    <button type="button" className="secondary-button"
                      disabled={receiptLoading}
                      onClick={() => void openInvoicePreview(undefined, lastReceipt.sale_number)}>
                      <Printer size={16} /> {receiptLoading ? 'Chargement…' : 'Aperçu / Imprimer'}
                    </button>
                  </div>
                )}

                <section className="sales-history">
                  <div className="sales-history-heading">
                    <div>
                      <h3>Historique des factures</h3>
                      <p>Consultez les dernières ventes enregistrées et retrouvez leur numéro.</p>
                    </div>
                    <button type="button" className="secondary-button"
                      disabled={salesHistoryLoading || !storeId}
                      onClick={() => void loadSalesHistory()}>
                      <RefreshCw size={16} /> {salesHistoryLoading ? 'Chargement…' : 'Afficher les factures'}
                    </button>
                  </div>
                  <form className="sales-history-search" onSubmit={e => { e.preventDefault(); void loadSalesHistory() }}>
                    <input
                      value={salesHistorySearch}
                      onChange={e => setSalesHistorySearch(e.target.value)}
                      placeholder="Rechercher par numéro de facture"
                      inputMode="numeric"
                    />
                    <button type="submit" className="secondary-button" disabled={salesHistoryLoading}>Rechercher</button>
                    <button type="button" className="secondary-button" disabled={salesHistoryLoading}
                      onClick={() => { setSalesHistorySearch(''); void loadSalesHistory() }}>Toutes</button>
                  </form>
                  {salesHistory.length > 0 && (
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Facture</th><th>Date</th><th>Montant</th><th>Statut</th><th>Action</th></tr></thead>
                        <tbody>
                          {salesHistory.map(sale => (
                            <tr key={sale.id}>
                              <td><strong>#{sale.sale_number}</strong></td>
                              <td>{new Date(sale.created_at).toLocaleString('fr-DZ')}</td>
                              <td>{Number(sale.total).toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {sale.currency || 'DZD'}</td>
                              <td>{sale.status}</td>
                              <td>
                                <div className="invoice-history-actions">
                                  <button type="button" className="secondary-button"
                                    disabled={receiptLoading}
                                    onClick={() => void openInvoicePreview(sale.id)}>
                                    <Printer size={15} /> Aperçu / Imprimer
                                  </button>
                                  <button type="button" className="secondary-button"
                                    onClick={() => { setReturnSearch(String(sale.sale_number)); setCurrentView('returns'); setError(''); setMessage('') }}>
                                    <Eye size={15} /> Retour
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!salesHistory.length && !salesHistoryLoading && (
                    <p className="muted">Cliquez sur « Afficher les factures » pour charger l’historique.</p>
                  )}
                </section>
                {receiptPreview && (
                  <div className={`invoice-preview-overlay ${invoicePrintFormat === "thermal" ? "print-thermal" : "print-a4"}`}>
                    <section className="invoice-preview-dialog">
                      <div className="invoice-preview-actions no-print">
                        <strong>Aperçu de la facture #{receiptPreview.sale_number}</strong>
                        <div className="invoice-preview-actions-controls">
                          <label className="invoice-format-control">
                            Format d’impression
                            <select value={invoicePrintFormat} onChange={e => setInvoicePrintFormat(e.target.value as "a4" | "thermal")}>
                              <option value="a4">A4 — imprimante classique</option>
                              <option value="thermal">Ticket thermique — 80 mm</option>
                            </select>
                          </label>
                          <button type="button" className="primary-button" onClick={() => window.print()}>
                            <Printer size={16} /> Imprimer cette facture
                          </button>
                          <button type="button" className="secondary-button" onClick={() => setReceiptPreview(null)}>
                            Fermer
                          </button>
                        </div>
                      </div>
                      <article className="receipt-print-area">
                        <header className="receipt-header">
                          <h1>StylePro Manager</h1>
                          <p>Facture de vente</p>
                          <h2>Facture N° {receiptPreview.sale_number}</h2>
                          <p>Date : {new Date(receiptPreview.created_at).toLocaleString('fr-DZ')}</p>
                        </header>
                        <table className="receipt-items-table">
                          <thead><tr><th>Article</th><th>Qté</th><th>Prix unitaire</th><th>Remise</th><th>Total</th></tr></thead>
                          <tbody>
                            {receiptPreview.items.map((item, index) => (
                              <tr key={`${item.sku}-${index}`}>
                                <td>
                                  <strong>{item.name}</strong>
                                  {item.sku && <div>Réf. : {item.sku}</div>}
                                  {(item.size || item.color) && <div>{[item.size, item.color].filter(Boolean).join(' / ')}</div>}
                                </td>
                                <td>{item.quantity}</td>
                                <td>{item.unit_price.toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                <td>{item.discount.toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                                <td>{(item.quantity * item.unit_price - item.discount).toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="receipt-total">
                          <span>Total à payer</span>
                          <strong>{receiptPreview.total.toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {receiptPreview.currency}</strong>
                        </div>
                        <footer className="receipt-footer">
                          <p>Merci pour votre achat !</p>
                          <small>Document généré par StylePro Manager</small>
                        </footer>
                      </article>
                    </section>
                  </div>
                )}

                <div className="pos-scanner-tools">
  <label className="field">
    Scanner USB / recherche
    <input
      ref={scannerInputRef}
      value={scannerCode}
      onChange={e => setScannerCode(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault()
          const code = scannerCode
          setScannerCode('')
          handleScannedCode(code)
          window.setTimeout(() => scannerInputRef.current?.focus(), 0)
        }
      }}
      placeholder="Scannez un code puis Entrée"
      autoComplete="off"
    />
  </label>

  {!cameraOpen ? (
    <button
      type="button"
      className="secondary-button"
      onClick={() => void startPOSCamera()}
    >
      Ouvrir la caméra
    </button>
  ) : (
    <button
      type="button"
      className="secondary-button"
      onClick={() => void stopPOSCamera()}
    >
      Fermer la caméra
    </button>
  )}

  {scannerMessage && (
    <p role="status" className="scanner-message">
      {scannerMessage}
    </p>
  )}

  <div
    id={scannerElementId}
    style={{
      display: cameraOpen ? 'block' : 'none',
      width: '100%',
      maxWidth: 420
    }}
  />
</div>

<div className="mobile-link-panel">
  <button
    type="button"
    className="secondary-button"
    onClick={() => void createMobileScannerSession()}
    disabled={mobileBusy || !storeId || !user}
  >
    {mobileBusy ? 'Connexion…' : 'Relier un téléphone'}
  </button>

  {mobileSession && (
    <div className="mobile-link-card">
      <h3>Scanner mobile connecté</h3>
      <p>Connectez le téléphone au même compte autorisé, puis scannez ce QR.</p>
      {mobileQr && <img src={mobileQr} alt="QR de connexion du scanner mobile" />}
      <p className="scanner-message">
        Expiration : {new Date(mobileSession.expires_at).toLocaleString('fr-DZ')}
      </p>
      <button
        type="button"
        className="secondary-button"
        onClick={() => void closeMobileScannerSession()}
      >
        Fermer la session
      </button>
    </div>
  )}
</div>

<div className="pos-filter-panel">
  <label className="field">
    Recherche article
    <input
      value={posSearch}
      onChange={e => setPosSearch(e.target.value)}
      placeholder="Nom, SKU, code-barres ou QR"
    />
  </label>
  <div className="pos-filter-grid">
    <label className="field">
      Catégorie
      <select value={posCategoryFilter} onChange={e => setPosCategoryFilter(e.target.value)}>
        <option value="">Toutes les catégories</option>
        {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
    </label>
    <label className="field">
      Marque
      <select value={posBrandFilter} onChange={e => setPosBrandFilter(e.target.value)}>
        <option value="">Toutes les marques</option>
        {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
      </select>
    </label>
    <label className="field">
      Taille
      <select value={posSizeFilter} onChange={e => setPosSizeFilter(e.target.value)}>
        <option value="">Toutes les tailles</option>
        {[...new Set(posVariants.map(v => v.size).filter((value): value is string => Boolean(value)))].sort().map(size =>
          <option key={size} value={size}>{size}</option>
        )}
      </select>
    </label>
    <label className="field">
      Couleur
      <select value={posColorFilter} onChange={e => setPosColorFilter(e.target.value)}>
        <option value="">Toutes les couleurs</option>
        {[...new Set(posVariants.map(v => v.color).filter((value): value is string => Boolean(value)))].sort().map(color =>
          <option key={color} value={color}>{color}</option>
        )}
      </select>
    </label>
  </div>
  {(posSearch || posCategoryFilter || posBrandFilter || posSizeFilter || posColorFilter) && (
    <button
      type="button"
      className="secondary-button pos-clear-filters"
      onClick={() => {
        setPosSearch('')
        setPosCategoryFilter('')
        setPosBrandFilter('')
        setPosSizeFilter('')
        setPosColorFilter('')
      }}
    >
      Effacer les filtres
    </button>
  )}
</div>
                <label className="field">Client (facultatif)
                  <select value={posCustomerId} onChange={e => setPosCustomerId(e.target.value)}>
                    <option value="">Client de passage</option>
                    {posCustomers.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` — ${c.phone}` : ''}</option>)}
                  </select>
                </label>
                <div className="pos-layout">
                  <div className="pos-products">
                    <h3>Articles actifs</h3>
                    <div className="pos-results-count">
                      {posVariants.filter(v => {
                        const p = products.find(x => x.id === v.product_id && x.active)
                        const q = posSearch.trim().toLowerCase()
                        return Boolean(
                          p &&
                          (!q || [p.name, v.sku, v.barcode ?? '', v.qr_token ?? ''].some(value => value.toLowerCase().includes(q))) &&
                          (!posCategoryFilter || p.category_id === posCategoryFilter) &&
                          (!posBrandFilter || p.brand_id === posBrandFilter) &&
                          (!posSizeFilter || v.size === posSizeFilter) &&
                          (!posColorFilter || v.color === posColorFilter)
                        )
                      }).length} variante(s) trouvée(s)
                    </div>
                    {posVariants.filter(v => {
                      const p = products.find(x => x.id === v.product_id && x.active)
                      const q = posSearch.trim().toLowerCase()
                      return Boolean(
                        p &&
                        (!q || [p.name, v.sku, v.barcode ?? '', v.qr_token ?? ''].some(value => value.toLowerCase().includes(q))) &&
                        (!posCategoryFilter || p.category_id === posCategoryFilter) &&
                        (!posBrandFilter || p.brand_id === posBrandFilter) &&
                        (!posSizeFilter || v.size === posSizeFilter) &&
                        (!posColorFilter || v.color === posColorFilter)
                      )
                    }).map(v => {
                      const p = products.find(x => x.id === v.product_id && x.active)
                      const stock = posStocks[v.id] ?? 0
                      return <button type="button" className="pos-product" key={v.id} disabled={stock <= 0} onClick={() => addPOSItem(v)}>
                        <span>
                          <strong>{p?.name}</strong>
                          <small>{v.sku}{v.size ? ` · ${v.size}` : ''}{v.color ? ` · ${v.color}` : ''}</small>
                          <small className={stock <= 0 ? "pos-stock-warning" : "pos-stock-ok"}>{stock > 0 ? `Stock disponible : ${stock}` : 'Rupture de stock'}</small>
                        </span>
                        <strong>{Number(v.sale_price).toLocaleString('fr-DZ')} DZD</strong>
                      </button>
                    })}
                    {!posVariants.some(v => {
                      const p = products.find(x => x.id === v.product_id && x.active)
                      const q = posSearch.trim().toLowerCase()
                      return Boolean(
                        p &&
                        (!q || [p.name, v.sku, v.barcode ?? '', v.qr_token ?? ''].some(value => value.toLowerCase().includes(q))) &&
                        (!posCategoryFilter || p.category_id === posCategoryFilter) &&
                        (!posBrandFilter || p.brand_id === posBrandFilter) &&
                        (!posSizeFilter || v.size === posSizeFilter) &&
                        (!posColorFilter || v.color === posColorFilter)
                      )
                    }) && <div className="empty-state"><Package size={26}/><p>Aucun article ne correspond aux filtres.</p><button type="button" className="secondary-button" onClick={() => { setPosSearch(''); setPosCategoryFilter(''); setPosBrandFilter(''); setPosSizeFilter(''); setPosColorFilter('') }}>Réinitialiser</button></div>}
                  </div>
                  <div className="pos-cart"><h3>Panier ({posCart.reduce((n,i) => n + i.quantity, 0)})</h3>
                    {!posCart.length ? <div className="empty-state"><ShoppingBag size={26}/><p>Ajoutez des articles au panier.</p></div> :
                      posCart.map(i => <div className="pos-cart-row" key={i.variant_id}>
                        <div className="pos-cart-info">
                          <strong>{i.name}</strong>
                          <small className="pos-cart-sku">Réf. {i.sku}</small>
                          <div className="pos-item-tags">
                            {i.size && <span>Taille : {i.size}</span>}
                            {i.color && <span>Couleur : {i.color}</span>}
                          </div>
                          <small>Prix original : {i.unit_price.toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD / unité</small>
                          <div className="pos-discount-controls">
                            <label>
                              Type de réduction
                              <select
                                disabled={Boolean(getPOSApplicablePromotion(i))}
                                value={i.discount_type}
                                onChange={e => setPosCart(cart => cart.map(x =>
                                  x.variant_id === i.variant_id
                                    ? {...x, discount_type: e.target.value as 'amount' | 'percent'}
                                    : x
                                ))}
                              >
                                <option value="amount">Montant (DZD / unité)</option>
                                <option value="percent">Pourcentage (%)</option>
                              </select>
                            </label>
                            <label>
                              Réduction
                              <input
                                type="number"
                                disabled={Boolean(getPOSApplicablePromotion(i))}
                                min="0"
                                max={i.discount_type === 'percent' ? 100 : i.unit_price}
                                step="0.01"
                                value={i.discount_value}
                                onChange={e => {
                                  const raw = e.target.value
                                  const parsed = raw === '' ? 0 : Number(raw)
                                  const max = i.discount_type === 'percent' ? 100 : i.unit_price
                                  const value = Number.isFinite(parsed)
                                    ? Math.min(max, Math.max(0, parsed))
                                    : 0
                                  setPosCart(cart => cart.map(x =>
                                    x.variant_id === i.variant_id
                                      ? {...x, discount_value: value}
                                      : x
                                  ))
                                }}
                              />
                            </label>
                          </div>
                          {getPOSApplicablePromotion(i) && (
                            <small className="promotion-status is-active">
                              Promotion appliquée : {getPOSApplicablePromotion(i)!.name}
                            </small>
                          )}
                          <small>
                            Réduction : {getPOSLineDiscount(i).toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD
                          </small>
                          <small>
                            Prix net / unité : {(i.unit_price - getPOSUnitDiscount(i)).toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD
                          </small>
                          <small className={i.stock - i.quantity <= 2 ? "pos-stock-warning" : "pos-stock-ok"}>
                            Stock disponible après vente : {i.stock - i.quantity}
                          </small>
                        </div>
                        <div className="pos-quantity">
                          <button type="button" className="secondary-button" onClick={() => setPosCart(cart => cart.flatMap(x => x.variant_id !== i.variant_id ? [x] : x.quantity > 1 ? [{...x, quantity:x.quantity-1}] : []))}>−</button>
                          <strong>{i.quantity}</strong>
                          <button type="button" className="secondary-button" disabled={i.quantity >= i.stock} onClick={() => setPosCart(cart => cart.map(x => x.variant_id === i.variant_id && x.quantity < x.stock ? {...x, quantity:x.quantity+1} : x))}>+</button>
                        </div>
                        <div className="pos-line-total">
                          {getPOSLineDiscount(i) > 0 && (
                            <small className="pos-original-total">
                              {(i.unit_price * i.quantity).toLocaleString('fr-DZ')} DZD
                            </small>
                          )}
                          <strong>{getPOSLineTotal(i).toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD</strong>
                        </div>
                      </div>)}
                    <div className="pos-summary">
                      <div className="pos-summary-line">
                        <span>Nombre d’articles</span>
                        <strong>{posCart.reduce((n, i) => n + i.quantity, 0)}</strong>
                      </div>
                      <div className="pos-summary-line">
                        <span>Montant avant réduction</span>
                        <strong>{posSubtotal.toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD</strong>
                      </div>
                      <div className="pos-summary-line">
                        <span>Réductions</span>
                        <strong>- {posDiscountTotal.toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD</strong>
                      </div>
                      <div className="pos-total">
                        <span>Total à payer</span>
                        <strong>{posPaymentTotal.toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD</strong>
                      </div>
                    </div>
                    <section className="pos-payment-panel" aria-label="Calcul du paiement">
                      <h3>Mode de paiement</h3>
                      <label className="field">
                        Moyen de paiement
                        <select value={posPaymentMethod} onChange={e => setPosPaymentMethod(e.target.value as 'cash' | 'card' | 'mixed')}>
                          <option value="cash">Espèces</option>
                          <option value="card">Carte bancaire</option>
                          <option value="mixed">Mixte : espèces + carte</option>
                        </select>
                      </label>
                      {posPaymentMethod !== 'card' && (
                        <label className="field">
                          {posPaymentMethod === 'mixed' ? 'Montant en espèces (DZD)' : 'Montant reçu (DZD)'}
                          <input type="number" min="0" step="0.01" inputMode="decimal"
                            value={posCashReceived}
                            onChange={e => setPosCashReceived(e.target.value)}
                            placeholder="0,00" />
                        </label>
                      )}
                      {posPaymentMethod === 'mixed' && (
                        <label className="field">
                          Montant payé par carte (DZD)
                          <input type="number" min="0" step="0.01" inputMode="decimal"
                            value={posCardAmount}
                            onChange={e => setPosCardAmount(e.target.value)}
                            placeholder="0,00" />
                        </label>
                      )}
                      <div className="pos-payment-result">
                        <div><span>Total à payer</span><strong>{posPaymentTotal.toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD</strong></div>
                        {posPaymentMethod === 'mixed' && (
                          <div><span>Total déclaré payé</span><strong>{posPaidValue.toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD</strong></div>
                        )}
                        <div className={posRemainingValue > 0 ? 'pos-payment-warning' : 'pos-payment-ok'}>
                          <span>{posRemainingValue > 0 ? 'Reste à payer' : 'Monnaie à rendre'}</span>
                          <strong>{(posRemainingValue > 0 ? posRemainingValue : posChangeValue).toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD</strong>
                        </div>
                      </div>
                      <p className="pos-payment-note">Calcul indicatif uniquement : le mode de paiement n’est pas encore enregistré dans la base de données.</p>
                    </section>
                    <button type="button" className="primary-button pos-checkout" disabled={posBusy || !posCart.length} onClick={() => void finishPOS()}>{posBusy ? 'Validation…' : 'Valider la vente'}</button>
                    <button type="button" className="secondary-button" disabled={posBusy || !posCart.length} onClick={() => setPosCart([])}>Vider le panier</button>
                  </div>
                </div>
              </section>

            ) : currentView === 'returns' ? (
              <section className="panel returns-panel">
                <div className="panel-heading">
                  <div className="panel-title">
                    <RotateCcw size={22} />
                    <div>
                      <h2>Retours / Remboursements</h2>
                      <p>Recherchez une facture et sélectionnez les articles retournés.</p>
                    </div>
                  </div>
                </div>

                <form className="returns-search" onSubmit={e => { e.preventDefault(); void searchReturnSale() }}>
                  <label className="field">
                    Numéro de facture
                    <input
                      value={returnSearch}
                      onChange={e => setReturnSearch(e.target.value)}
                      placeholder="Ex. 10025"
                      inputMode="numeric"
                    />
                  </label>
                  <button className="primary-button" type="submit" disabled={returnLoading || !storeId}>
                    {returnLoading ? 'Recherche…' : 'Rechercher la facture'}
                  </button>
                </form>

                {returnSale && (
                  <>
                    <div className="returns-sale-summary">
                      <div><small>Facture</small><strong>#{returnSale.sale_number}</strong></div>
                      <div><small>Date</small><strong>{new Date(returnSale.created_at).toLocaleDateString('fr-DZ')}</strong></div>
                      <div><small>Total initial</small><strong>{Number(returnSale.total).toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} {returnSale.currency || 'DZD'}</strong></div>
                    </div>

                    <label className="field returns-reason">
                      Motif du retour
                      <select value={returnReason} onChange={e => setReturnReason(e.target.value)}>
                        <option value="Retour produit">Retour produit</option>
                        <option value="Taille incorrecte">Taille incorrecte</option>
                        <option value="Défaut produit">Défaut produit</option>
                        <option value="Erreur de vente">Erreur de vente</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </label>

                    <div className="table-wrap returns-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Article</th>
                            <th>Vendu</th>
                            <th>Déjà retourné</th>
                            <th>Restant</th>
                            <th>Prix unit.</th>
                            <th>Qté retour</th>
                            <th>Remettre en stock</th>
                          </tr>
                        </thead>
                        <tbody>
                          {returnLines.map(line => (
                            <tr key={line.sale_item_id}>
                              <td>
                                <strong>{line.name}</strong>
                                <small className="returns-sku">{line.sku}</small>
                                <small>{[line.size, line.color].filter(Boolean).join(' · ') || '—'}</small>
                              </td>
                              <td>{line.sold_quantity}</td>
                              <td>{line.already_returned}</td>
                              <td>{line.remaining}</td>
                              <td>{line.unit_price.toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD</td>
                              <td>
                                <input
                                  className="returns-quantity"
                                  aria-label={`Quantité à retourner : ${line.name}`}
                                  type="number"
                                  min="0"
                                  max={line.remaining}
                                  step="1"
                                  value={line.quantity}
                                  disabled={line.remaining === 0 || returnBusy}
                                  onChange={e => {
                                    const parsed = Number(e.target.value)
                                    const quantity = Number.isFinite(parsed)
                                      ? Math.min(line.remaining, Math.max(0, Math.floor(parsed)))
                                      : 0
                                    setReturnLines(rows => rows.map(row =>
                                      row.sale_item_id === line.sale_item_id ? {...row, quantity} : row
                                    ))
                                  }}
                                />
                              </td>
                              <td>
                                <label className="returns-restock">
                                  <input
                                    type="checkbox"
                                    checked={line.restock}
                                    disabled={line.remaining === 0 || returnBusy}
                                    onChange={e => setReturnLines(rows => rows.map(row =>
                                      row.sale_item_id === line.sale_item_id
                                        ? {...row, restock: e.target.checked}
                                        : row
                                    ))}
                                  />
                                  Oui
                                </label>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="pos-summary returns-total">
                      <div className="pos-summary-line">
                        <span>Articles sélectionnés</span>
                        <strong>{returnLines.reduce((sum, line) => sum + line.quantity, 0)}</strong>
                      </div>
                      <div className="pos-total">
                        <span>Montant estimé à rembourser</span>
                        <strong>
                          {returnLines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0)
                            .toLocaleString('fr-DZ', {minimumFractionDigits: 2, maximumFractionDigits: 2})} DZD
                        </strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="primary-button returns-confirm"
                      disabled={returnBusy || !returnLines.some(line => line.quantity > 0)}
                      onClick={() => {
                        const count = returnLines.reduce((sum, line) => sum + line.quantity, 0)
                        if (window.confirm(`Confirmer le retour de ${count} article(s) ? Cette opération ne peut pas être annulée depuis cette page.`)) {
                          void submitReturn()
                        }
                      }}
                    >
                      {returnBusy ? 'Enregistrement…' : 'Confirmer le retour'}
                    </button>
                  </>
                )}

                {!returnSale && !returnLoading && (
                  <div className="empty-state">
                    <RotateCcw size={28} />
                    <strong>Aucun retour en cours</strong>
                    <p>Recherchez une facture terminée pour consulter les quantités retournables.</p>
                  </div>
                )}
              </section>
            ) : currentView === 'customers' ? (
              <section className="panel"><div className="panel-title"><Users size={20}/><div><h2>Clients</h2><p>Clients enregistrés dans votre boutique.</p></div></div>
                {!posCustomers.length ? <div className="empty-state"><Users size={28}/><p>Aucun client trouvé.</p></div> :
                  <div className="table-wrap"><table><thead><tr><th>Nom</th><th>Téléphone</th></tr></thead><tbody>{posCustomers.map(c => <tr key={c.id}><td>{c.full_name}</td><td>{c.phone || '—'}</td></tr>)}</tbody></table></div>}
              </section>
            ) : currentView === 'statistics' ? (
              <>
                <div className="welcome">
                  <div>
                    <p className="eyebrow">PILOTAGE COMMERCIAL</p>
                    <h1>Statistiques</h1>
                    <p className="muted">Indicateurs de la boutique sélectionnée.</p>
                  </div>
                  <button type="button" className="secondary-button"
                    disabled={analyticsLoading || !storeId}
                    onClick={() => void loadAnalytics()}>
                    <RefreshCw size={16} /> {analyticsLoading ? 'Actualisation…' : 'Actualiser'}
                  </button>
                </div>
                {(() => {
                  const now = new Date()
                  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
                  const completedAt = (s: AnalyticsData['sales'][number]) =>
                    new Date(s.completed_at || s.created_at)
                  const todaySales = analytics.sales.filter(s => completedAt(s) >= dayStart)
                  const monthSales = analytics.sales.filter(s => completedAt(s) >= monthStart)
                  const todayIds = new Set(todaySales.map(s => s.id))
                  const monthIds = new Set(monthSales.map(s => s.id))
                  const todayReturns = analytics.returns
                    .filter(r => new Date(r.created_at) >= dayStart && todayIds.has(r.sale_id))
                    .reduce((sum, r) => sum + Number(r.total || 0), 0)
                  const monthReturns = analytics.returns
                    .filter(r => new Date(r.created_at) >= monthStart && monthIds.has(r.sale_id))
                    .reduce((sum, r) => sum + Number(r.total || 0), 0)
                  const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0)
                  const monthRevenue = monthSales.reduce((sum, s) => sum + Number(s.total || 0), 0)
                  const monthExpenses = analytics.expenses
                    .filter(e => {
                      const d = new Date(`${e.expense_date}T00:00:00`)
                      return d >= monthStart && d <= now
                    })
                    .reduce((sum, e) => sum + Number(e.amount || 0), 0)
                  const netToday = todayRevenue - todayReturns
                  const netMonth = monthRevenue - monthReturns
                  const currency = stores.find(s => s.id === storeId)?.currency || 'DZD'
                  const money = (n: number) => `${n.toLocaleString('fr-DZ', {
                    minimumFractionDigits: 2, maximumFractionDigits: 2
                  })} ${currency}`
                  return <>
                    <div className="stats-grid analytics-grid">
                      <div className="stat-card"><div className="stat-icon green"><TrendingUp /></div><span>Ventes nettes aujourd'hui</span><strong>{money(netToday)}</strong><small>{todaySales.length} facture(s) complétée(s), retours déduits</small></div>
                      <div className="stat-card"><div className="stat-icon blue"><ShoppingBag /></div><span>Ventes nettes du mois</span><strong>{money(netMonth)}</strong><small>{monthSales.length} facture(s), retours déduits</small></div>
                      <div className="stat-card"><div className="stat-icon violet"><Store /></div><span>Panier moyen du mois</span><strong>{money(monthSales.length ? monthRevenue / monthSales.length : 0)}</strong><small>Calculé avant déduction des retours</small></div>
                      <div className="stat-card"><div className="stat-icon blue"><TrendingUp /></div><span>Nombre de ventes aujourd'hui</span><strong>{todaySales.length}</strong><small>Ventes au statut completed</small></div>
                      <div className="stat-card"><div className="stat-icon violet"><Package /></div><span>Dépenses du mois</span><strong>{money(monthExpenses)}</strong><small>Dépenses enregistrées dans l'application</small></div>
                      <div className="stat-card"><div className="stat-icon green"><AlertCircle /></div><span>Variantes en stock faible</span><strong>{analytics.lowStock.length}</strong><small>Stock inférieur ou égal au minimum configuré</small></div>
                    </div>
                    <section className="panel">
                      <div className="panel-title"><TrendingUp size={20}/><div><h2>Ventes récentes</h2><p>Les 8 dernières factures complétées de cette boutique.</p></div></div>
                      {analyticsLoading ? <p className="muted">Chargement des données…</p> :
                        !analytics.sales.length ? <div className="empty-state"><ShoppingBag size={26}/><p>Aucune vente complétée pour le moment.</p></div> :
                        <div className="table-wrap"><table><thead><tr><th>Facture</th><th>Date</th><th>Montant</th><th>Statut</th></tr></thead>
                          <tbody>{analytics.sales.slice(0, 8).map(s => <tr key={s.id}>
                            <td>#{s.sale_number}</td>
                            <td>{new Date(s.completed_at || s.created_at).toLocaleString('fr-DZ')}</td>
                            <td>{money(Number(s.total || 0))}</td>
                            <td><span className="analytics-status">Complétée</span></td>
                          </tr>)}</tbody></table></div>}
                    </section>
                    <section className="panel">
                      <div className="panel-title"><AlertCircle size={20}/><div><h2>Alertes de stock</h2><p>Variantes actives au seuil minimum ou en dessous.</p></div></div>
                      {!analytics.lowStock.length ? <div className="empty-state"><Package size={26}/><p>Aucune alerte de stock selon les seuils configurés.</p></div> :
                        <div className="table-wrap"><table><thead><tr><th>Référence</th><th>Stock actuel</th><th>Stock minimum</th></tr></thead>
                          <tbody>{analytics.lowStock.slice(0, 12).map(v => <tr key={v.id}>
                            <td>{v.sku}</td><td>{v.current}</td><td>{v.minimum}</td>
                          </tr>)}</tbody></table></div>}
                    </section>
                    <p className="muted analytics-disclaimer">Les chiffres sont calculés à partir des ventes complétées et des données actuellement enregistrées. Les dépenses ne constituent pas à elles seules un calcul du bénéfice net comptable.</p>
                  </>
                })()}
              </>
            ) : currentView === 'promotions' ? (
              <>
                <div className="welcome">
                  <div>
                    <p className="eyebrow">OFFRES COMMERCIALES</p>
                    <h1>Promotions</h1>
                    <p className="muted">Créez et gérez les remises de votre boutique.</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => void loadPromotions()} disabled={promotionLoading || !storeId}>
                    <RefreshCw size={16} /> Actualiser
                  </button>
                </div>

                <section className="panel">
                  <div className="panel-title">
                    <TrendingUp size={20} />
                    <div>
                      <h2>{promotionEditingId ? 'Modifier la promotion' : 'Nouvelle promotion'}</h2>
                      <p>Une remise par produit. Les promotions ne sont pas encore appliquées automatiquement à la caisse.</p>
                    </div>
                  </div>

                  <form className="promotion-form" onSubmit={savePromotion}>
                    <label>Nom de la promotion *
                      <input value={promotionName} onChange={e => setPromotionName(e.target.value)} required maxLength={150} placeholder="Ex. Soldes d’hiver" />
                    </label>
                    <label>Description
                      <input value={promotionDescription} onChange={e => setPromotionDescription(e.target.value)} maxLength={500} placeholder="Description facultative" />
                    </label>
                    <div className="promotion-fields">
                      <label>Type de remise
                        <select value={promotionType} onChange={e => setPromotionType(e.target.value as 'amount' | 'percent')}>
                          <option value="percent">Pourcentage (%)</option>
                          <option value="amount">Montant fixe</option>
                        </select>
                      </label>
                      <label>{promotionType === 'percent' ? 'Remise (%)' : `Remise (${stores.find(s => s.id === storeId)?.currency || 'DZD'})`}
                        <input type="number" min="0.01" max={promotionType === 'percent' ? 100 : undefined} step="0.01" value={promotionValue} onChange={e => setPromotionValue(e.target.value)} required />
                      </label>
                      <label>Date et heure de début
                        <input type="datetime-local" value={promotionStart} onChange={e => setPromotionStart(e.target.value)} required />
                      </label>
                      <label>Date et heure de fin
                        <input type="datetime-local" value={promotionEnd} onChange={e => setPromotionEnd(e.target.value)} required />
                      </label>
                    </div>

                    <div className="promotion-active-card">
  <div className="promotion-active-copy">
    <span className="promotion-active-icon">
      <Check size={18} />
    </span>
    <div>
      <strong>Promotion activée</strong>
      <small>
        {promotionActive
          ? 'Cette offre est marquée comme active.'
          : 'Cette offre restera désactivée.'}
      </small>
    </div>
  </div>

  <button
    type="button"
    role="switch"
    aria-checked={promotionActive}
    aria-label="Activer ou désactiver la promotion"
    className={`promotion-switch ${promotionActive ? 'is-on' : ''}`}
    onClick={() => setPromotionActive(value => !value)}
  >
    <span />
  </button>
</div>

<div className="promotion-product-section">
  <div className="promotion-product-heading">
    <div>
      <strong>Produits concernés</strong>
      <p className="muted">
        {promotionProductIds.length} produit(s) sélectionné(s)
      </p>
    </div>

    <div className="promotion-product-tools">
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          const visibleIds = products
            .filter(p => {
              if (!p.active) return false

              const variants = posVariants.filter(v => v.product_id === p.id)
              const query = promotionSearch.trim().toLocaleLowerCase()

              return (
                !query ||
                p.name.toLocaleLowerCase().includes(query) ||
                variants.some(v =>
                  [v.sku, v.barcode, v.size, v.color]
                    .some(value =>
                      (value ?? '').toLocaleLowerCase().includes(query)
                    )
                )
              )
            })
            .map(p => p.id)

          setPromotionProductIds(ids => [
            ...new Set([...ids, ...visibleIds])
          ])
        }}
      >
        <CheckSquare size={16} /> Tout sélectionner
      </button>

      <button
        type="button"
        className="secondary-button"
        onClick={() => setPromotionProductIds([])}
      >
        <Square size={16} /> Tout désélectionner
      </button>
    </div>

    <div className="promotion-search-box">
      <Search size={18} />
      <input
        value={promotionSearch}
        onChange={e => setPromotionSearch(e.target.value)}
        placeholder="Nom, référence, code-barres, taille…"
        aria-label="Rechercher un produit"
      />
    </div>
  </div>

  <div className="promotion-product-grid">
    {products
      .filter(product => {
        if (!product.active) return false

        const query = promotionSearch.trim().toLocaleLowerCase()
        const variants = posVariants.filter(v => v.product_id === product.id)

        return (
          !query ||
          product.name.toLocaleLowerCase().includes(query) ||
          variants.some(v =>
            [v.sku, v.barcode, v.size, v.color]
              .some(value =>
                (value ?? '').toLocaleLowerCase().includes(query)
              )
          )
        )
      })
      .map(product => {
        const selected = promotionProductIds.includes(product.id)
        const variants = posVariants.filter(
          v => v.product_id === product.id
        )

        const prices = variants
          .filter(v => v.active)
          .map(v => Number(v.sale_price))
          .filter(price => Number.isFinite(price) && price >= 0)

        const minPrice = prices.length ? Math.min(...prices) : null
        const maxPrice = prices.length ? Math.max(...prices) : null

        const stock = variants.reduce(
          (total, variant) =>
            total + (posStocks[variant.id] ?? 0),
          0
        )

        const brand = brands.find(b => b.id === product.brand_id)?.name
        const category = categories.find(
          c => c.id === product.category_id
        )?.name

        const discountedPrice = (price: number) =>
          Math.max(
            0,
            promotionType === 'percent'
              ? price * (1 - Number(promotionValue || 0) / 100)
              : price - Number(promotionValue || 0)
          )

        return (
          <label
            key={product.id}
            className={`promotion-product-card ${selected ? 'is-selected' : ''}`}
          >
            <input
              className="promotion-product-checkbox"
              type="checkbox"
              checked={selected}
              onChange={e =>
                setPromotionProductIds(ids =>
                  e.target.checked
                    ? [...ids, product.id]
                    : ids.filter(id => id !== product.id)
                )
              }
            />

            <span className="promotion-product-check">
              <Check size={14} />
            </span>

            <span className="promotion-product-card-content">
              <span className="promotion-product-title">
                {product.name}
              </span>

              <span className="promotion-product-meta">
                {brand || 'Sans marque'}
                {category ? ` · ${category}` : ''}
              </span>

              <span className="promotion-product-variants">
                {variants.length
                  ? `${variants.length} variante(s)`
                  : 'Aucune variante active chargée'}
              </span>

              {variants.length > 0 && (
                <span className="promotion-product-reference">
                  {variants
                    .slice(0, 3)
                    .map(v =>
                      [
                        v.sku || 'Sans réf.',
                        v.size,
                        v.color,
                        v.barcode ? `CB ${v.barcode}` : null
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    )
                    .join(' / ')}
                  {variants.length > 3 ? ' …' : ''}
                </span>
              )}

              <span className="promotion-product-bottom">
                <span className="promotion-product-price">
                  {minPrice === null
                    ? 'Prix non disponible'
                    : minPrice === maxPrice
                      ? `${new Intl.NumberFormat('fr-DZ', {style: 'currency', currency: stores.find(s => s.id === storeId)?.currency || 'DZD'}).format(minPrice)}`
                      : `${new Intl.NumberFormat('fr-DZ', {style: 'currency', currency: stores.find(s => s.id === storeId)?.currency || 'DZD'}).format(minPrice)} – ${new Intl.NumberFormat('fr-DZ', {style: 'currency', currency: stores.find(s => s.id === storeId)?.currency || 'DZD'}).format(maxPrice ?? minPrice ?? 0)}`}
                </span>

                <span
                  className={`promotion-stock ${
                    stock <= 0 ? 'is-empty' : ''
                  }`}
                >
                  Stock : {stock}
                </span>
              </span>

              {selected && minPrice !== null && (
                <span className="promotion-price-preview">
                  Après remise : {new Intl.NumberFormat('fr-DZ', {style: 'currency', currency: stores.find(s => s.id === storeId)?.currency || 'DZD'}).format(discountedPrice(minPrice))}
                  {maxPrice !== null && maxPrice !== minPrice
                    ? ` – ${new Intl.NumberFormat('fr-DZ', {style: 'currency', currency: stores.find(s => s.id === storeId)?.currency || 'DZD'}).format(discountedPrice(maxPrice))}`
                    : ''}
                </span>
              )}
            </span>
          </label>
        )
      })}

    {!products.some(product => {
      if (!product.active) return false

      const query = promotionSearch.trim().toLocaleLowerCase()
      const variants = posVariants.filter(v => v.product_id === product.id)

      return (
        !query ||
        product.name.toLocaleLowerCase().includes(query) ||
        variants.some(v =>
          [v.sku, v.barcode, v.size, v.color]
            .some(value =>
              (value ?? '').toLocaleLowerCase().includes(query)
            )
        )
      )
    }) && (
      <div className="promotion-no-products">
        <Package size={26} />
        <strong>Aucun produit trouvé</strong>
        <span>Essayez un autre nom ou une autre référence.</span>
      </div>
    )}
  </div>
</div>
                  {promotionSaving && (
                    <p className="muted" role="status">
                      Enregistrement de la promotion…
                    </p>
                  )}

                  <div className="promotion-form-actions">
                    {promotionEditingId && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={resetPromotionForm}
                        disabled={promotionSaving}
                      >
                        Annuler
                      </button>
                    )}

                    <button
                      type="submit"
                      className="primary-button"
                      disabled={promotionSaving || !storeId}
                    >
                      {promotionSaving
                        ? 'Enregistrement…'
                        : promotionEditingId
                          ? 'Enregistrer les modifications'
                          : 'Enregistrer la promotion'}
                    </button>
                  </div>
</form>
                </section>

                <section className="panel">
                  <div className="panel-title">
                    <Package size={20} />
                    <div><h2>Promotions enregistrées</h2><p>{promotions.length} offre(s) pour la boutique sélectionnée.</p></div>
                  </div>
                  {promotionLoading ? <p className="muted">Chargement des promotions…</p> :
                    promotions.length === 0 ? (
                      <div className="empty-state"><TrendingUp size={28} /><strong>Aucune promotion</strong><p>Créez votre première offre avec le formulaire ci-dessus.</p></div>
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Promotion</th><th>Remise</th><th>Période</th><th>État</th><th>Actions</th></tr></thead>
                          <tbody>
                            {promotions.map(promotion => {
                              const now = Date.now()
                              const start = new Date(promotion.start_at).getTime()
                              const end = new Date(promotion.end_at).getTime()
                              const status = !promotion.is_active ? 'Désactivée' : now < start ? 'À venir' : now > end ? 'Terminée' : 'Active'
                              return <tr key={promotion.id}>
                                <td>
                                  <strong>{promotion.name}</strong>
                                  {promotion.description && <small className="promotion-description">{promotion.description}</small>}
                                  <small className="promotion-description">
                                    {(() => {
                                      const linkedIds = promotionProductIdsByPromotion[promotion.id] ?? []
                                      return `${linkedIds.length} produit${linkedIds.length > 1 ? 's' : ''} associé${linkedIds.length > 1 ? 's' : ''}`
                                    })()}
                                  </small>
                                  {(promotionProductIdsByPromotion[promotion.id] ?? []).length > 0 && (
                                    <ul className="promotion-product-list">
                                      {(promotionProductIdsByPromotion[promotion.id] ?? []).map(productId => {
                                        const product = products.find(item => item.id === productId)
                                        const variants = posVariants.filter(
                                          variant => variant.product_id === productId && variant.active
                                        )
                                        const currency = stores.find(store => store.id === storeId)?.currency || 'DZD'

                                        return (
                                          <li key={productId} className="promotion-product-detail">
                                            <strong>{product ? product.name : 'Produit indisponible'}</strong>

                                            {variants.length === 0 ? (
                                              <small className="promotion-description">
                                                Aucune variante active ou prix disponible.
                                              </small>
                                            ) : (
                                              <ul className="promotion-variant-list">
                                                {variants.map(variant => {
                                                  const originalPrice = Math.max(0, Number(variant.sale_price) || 0)
                                                  const requestedDiscount = promotion.discount_type === 'percent'
                                                    ? originalPrice * Math.min(100, Math.max(0, Number(promotion.discount_value) || 0)) / 100
                                                    : Math.min(originalPrice, Math.max(0, Number(promotion.discount_value) || 0))
                                                  const discount = Math.round(requestedDiscount * 100) / 100
                                                  const finalPrice = Math.max(0, Math.round((originalPrice - discount) * 100) / 100)
                                                  const stock = Number(posStocks[variant.id] ?? 0)

                                                  return (
                                                    <li key={variant.id} className="promotion-variant-detail">
                                                      <small>
                                                        {[
                                                          variant.size ? `Taille : ${variant.size}` : null,
                                                          variant.color ? `Couleur : ${variant.color}` : null,
                                                          `Réf. : ${variant.sku}`,
                                                        ].filter(Boolean).join(' · ')}
                                                      </small>
                                                      <small>
                                                        Prix initial : {originalPrice.toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                                                      </small>
                                                      <small>
                                                        Remise : −{discount.toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                                                        {promotion.discount_type === 'percent' ? ` (${promotion.discount_value} %)` : ''}
                                                      </small>
                                                      <strong>
                                                        Prix promotionnel : {finalPrice.toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                                                      </strong>
                                                      <small>Stock actuel : {stock}</small>
                                                    </li>
                                                  )
                                                })}
                                              </ul>
                                            )}
                                          </li>
                                        )
                                      })}
                                    </ul>
                                  )}
                                </td>
                                <td>{promotion.discount_type === 'percent' ? `${promotion.discount_value}%` : `${Number(promotion.discount_value).toLocaleString('fr-DZ')} ${stores.find(s => s.id === storeId)?.currency || 'DZD'}`}</td>
                                <td><small>{new Date(promotion.start_at).toLocaleString('fr-DZ')}</small><small className="promotion-description">au {new Date(promotion.end_at).toLocaleString('fr-DZ')}</small></td>
                                <td><span className={`promotion-status ${status === 'Active' ? 'is-active' : ''}`}>{status}</span></td>
                                <td><div className="promotion-row-actions">
                                  <button type="button" className="secondary-button" onClick={() => void editPromotion(promotion)}><Pencil size={14} /> Modifier</button>
                                  <button type="button" className="secondary-button" onClick={() => void togglePromotion(promotion)}>{promotion.is_active ? 'Désactiver' : 'Activer'}</button>
                                </div></td>
                              </tr>
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                </section>
              </>
            ) : currentView === 'dashboard' ? (
              <>
              <div className="welcome">
              <div>
                <p className="eyebrow">VOTRE ESPACE DE TRAVAIL</p>
                <h1>Tableau de bord</h1>
                <p className="muted">Gérez votre boutique depuis un seul endroit.</p>
              </div>
              <div className="secure-label"><ShieldCheck size={17} /> Session authentifiée</div>
            </div>

            <div className="stats-grid">
              <div className="stat-card"><div className="stat-icon blue"><Store /></div><span>Boutiques</span><strong>{stores.length}</strong><small>Accessible(s) par votre compte</small></div>
              <div className="stat-card"><div className="stat-icon violet"><Package /></div><span>Articles au catalogue</span><strong>{products.length}</strong><small>Dans la boutique sélectionnée</small></div>
              <div className="stat-card"><div className="stat-icon green"><TrendingUp /></div><span>Articles actifs</span><strong>{products.filter(item => item.active).length}</strong><small>Produits disponibles au catalogue</small></div>
            </div>

            <section className="dashboard-analytics-extra panel">
              <div className="panel-title">
                <TrendingUp size={20} />
                <div><h2>Performance commerciale</h2><p>Indicateurs de la boutique sélectionnée.</p></div>
                <button type="button" className="secondary-button"
                  disabled={analyticsLoading || !storeId}
                  onClick={() => void loadAnalytics()}>
                  <RefreshCw size={16} /> Actualiser
                </button>
              </div>
              {(() => {
                const now = new Date()
                const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
                const completedAt = (sale: AnalyticsData['sales'][number]) =>
                  new Date(sale.completed_at || sale.created_at)
                const today = analytics.sales.filter(sale => completedAt(sale) >= dayStart)
                const month = analytics.sales.filter(sale => completedAt(sale) >= monthStart)
                const todayIds = new Set(today.map(sale => sale.id))
                const monthIds = new Set(month.map(sale => sale.id))
                const todayReturns = analytics.returns
                  .filter(r => new Date(r.created_at) >= dayStart && todayIds.has(r.sale_id))
                  .reduce((sum, r) => sum + Number(r.total || 0), 0)
                const monthReturns = analytics.returns
                  .filter(r => new Date(r.created_at) >= monthStart && monthIds.has(r.sale_id))
                  .reduce((sum, r) => sum + Number(r.total || 0), 0)
                const todayTotal = today.reduce((sum, sale) => sum + Number(sale.total || 0), 0) - todayReturns
                const monthTotal = month.reduce((sum, sale) => sum + Number(sale.total || 0), 0) - monthReturns
                const currency = stores.find(store => store.id === storeId)?.currency || 'DZD'
                const money = (amount: number) =>
                  `${amount.toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
                return <div className="dashboard-analytics-grid">
                  <div className="dashboard-mini-stat">
                    <span>Ventes nettes aujourd'hui</span>
                    <strong>{analyticsLoading ? '…' : money(todayTotal)}</strong>
                    <small>{today.length} vente(s) complétée(s)</small>
                  </div>
                  <div className="dashboard-mini-stat">
                    <span>Ventes nettes du mois</span>
                    <strong>{analyticsLoading ? '…' : money(monthTotal)}</strong>
                    <small>{month.length} vente(s) complétée(s)</small>
                  </div>
                  <div className="dashboard-mini-stat">
                    <span>Panier moyen du mois</span>
                    <strong>{analyticsLoading ? '…' : money(month.length ? month.reduce((sum, sale) => sum + Number(sale.total || 0), 0) / month.length : 0)}</strong>
                    <small>Avant déduction des retours</small>
                  </div>
                  <div className="dashboard-mini-stat">
                    <span>Alertes stock faible</span>
                    <strong>{analyticsLoading ? '…' : analytics.lowStock.length}</strong>
                    <small>Variantes au seuil minimum ou en dessous</small>
                  </div>
                </div>
              })()}

              <div className="dashboard-insights-grid">
                <section className="panel dashboard-chart-panel">
                  <div className="panel-title">
                    <TrendingUp size={20} />
                    <div>
                      <h2>Évolution des ventes</h2>
                      <p>Chiffre d'affaires des 7 derniers jours.</p>
                    </div>
                  </div>
                  {(() => {
                    const now = new Date()
                    const days = Array.from({ length: 7 }, (_, index) => {
                      const date = new Date(now)
                      date.setHours(0, 0, 0, 0)
                      date.setDate(date.getDate() - (6 - index))
                      const next = new Date(date)
                      next.setDate(next.getDate() + 1)
                      const total = analytics.sales
                        .filter(sale => {
                          const d = new Date(sale.completed_at || sale.created_at)
                          return d >= date && d < next
                        })
                        .reduce((sum, sale) => sum + Number(sale.total || 0), 0)
                      return { date, total }
                    })
                    const max = Math.max(...days.map(day => day.total), 1)
                    const currency = stores.find(store => store.id === storeId)?.currency || 'DZD'
                    return (
                      <div className="dashboard-sales-chart" role="img"
                        aria-label="Graphique des ventes des sept derniers jours">
                        {days.map(day => (
                          <div className="dashboard-chart-column"
                            key={day.date.toISOString()}>
                            <strong title={`${day.total.toLocaleString('fr-DZ')} ${currency}`}>
                              {day.total > 0
                                ? day.total.toLocaleString('fr-DZ', {
                                    notation: 'compact',
                                    maximumFractionDigits: 1
                                  })
                                : '—'}
                            </strong>
                            <div className="dashboard-chart-track">
                              <div className="dashboard-chart-bar"
                                style={{ height: `${day.total > 0 ? Math.max(8, day.total / max * 100) : 2}%` }} />
                            </div>
                            <span>{day.date.toLocaleDateString('fr-DZ', { weekday: 'short' })}</span>
                            <small>{day.date.toLocaleDateString('fr-DZ', { day: '2-digit', month: '2-digit' })}</small>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  {analyticsLoading && <p className="muted">Actualisation des données…</p>}
                  {!analyticsLoading && analytics.sales.length === 0 && (
                    <p className="muted">Les ventes apparaîtront ici après les premières factures complétées.</p>
                  )}
                </section>

                <section className="panel dashboard-chart-panel dashboard-expense-chart">
                  <div className="panel-title"><Activity size={20} /><div><h2>Suivi des dépenses</h2><p>Dépenses enregistrées sur les 7 derniers jours.</p></div></div>
                  {(() => {
                    const now = new Date()
                    const days = Array.from({ length: 7 }, (_, index) => {
                      const date = new Date(now)
                      date.setHours(0, 0, 0, 0)
                      date.setDate(date.getDate() - (6 - index))
                      const next = new Date(date)
                      next.setDate(next.getDate() + 1)
                      const total = analytics.expenses.filter(expense => {
                        const d = new Date(`${expense.expense_date}T00:00:00`)
                        return d >= date && d < next
                      }).reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
                      return { date, total }
                    })
                    const max = Math.max(...days.map(day => day.total), 1)
                    const currency = stores.find(store => store.id === storeId)?.currency || 'DZD'
                    return <div className="dashboard-sales-chart" role="img" aria-label="Dépenses des sept derniers jours">
                      {days.map(day => <div className="dashboard-chart-column" key={day.date.toISOString()}>
                        <strong title={`${day.total.toLocaleString('fr-DZ')} ${currency}`}>{day.total > 0 ? day.total.toLocaleString('fr-DZ', { notation: 'compact', maximumFractionDigits: 1 }) : '—'}</strong>
                        <div className="dashboard-chart-track"><div className="dashboard-expense-bar" style={{ height: `${day.total > 0 ? Math.max(8, day.total / max * 100) : 2}%` }} /></div>
                        <span>{day.date.toLocaleDateString('fr-DZ', { weekday: 'short' })}</span>
                        <small>{day.date.toLocaleDateString('fr-DZ', { day: '2-digit', month: '2-digit' })}</small>
                      </div>)}
                    </div>
                  })()}
                  {!analyticsLoading && analytics.expenses.length === 0 && <p className="muted">Aucune dépense enregistrée sur la période chargée.</p>}
                </section>

                <section className="panel dashboard-recent-sales">
                  <div className="panel-title">
                    <ShoppingBag size={20} />
                    <div>
                      <h2>Dernières ventes</h2>
                      <p>Factures récemment enregistrées.</p>
                    </div>
                  </div>
                  {!analytics.sales.length ? (
                    <div className="empty-state">
                      <ShoppingBag size={25} />
                      <p>Aucune vente complétée pour le moment.</p>
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Facture</th><th>Date</th><th>Montant</th></tr>
                        </thead>
                        <tbody>
                          {[...analytics.sales]
                            .sort((a, b) =>
                              new Date(b.completed_at || b.created_at).getTime() -
                              new Date(a.completed_at || a.created_at).getTime()
                            )
                            .slice(0, 5)
                            .map(sale => (
                              <tr key={sale.id}>
                                <td>#{sale.sale_number}</td>
                                <td>{new Date(sale.completed_at || sale.created_at)
                                  .toLocaleDateString('fr-DZ')}</td>
                                <td>{Number(sale.total || 0).toLocaleString('fr-DZ', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })} {stores.find(store => store.id === storeId)?.currency || 'DZD'}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>


              <section className="panel dashboard-stock-alerts">
                <div className="panel-title">
                  <AlertCircle size={20} />
                  <div>
                    <h2>Alertes de stock</h2>
                    <p>Articles dont le stock atteint le seuil minimum configuré.</p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button dashboard-stock-link"
                    onClick={() => setCurrentView('stock')}
                  >
                    <Package size={16} /> Gestion du stock
                  </button>
                </div>

                {analyticsLoading ? (
                  <p className="muted">Vérification du stock…</p>
                ) : analytics.lowStock.length === 0 ? (
                  <div className="stock-alert-empty">
                    <ShieldCheck size={25} />
                    <div>
                      <strong>Aucune alerte de stock</strong>
                      <p>Les données chargées ne signalent aucune variante sous son seuil minimum.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="stock-alert-summary">
                      <AlertCircle size={17} />
                      <span>
                        <strong>{analytics.lowStock.length}</strong>
                        {' '}variante(s) nécessitent une vérification.
                      </span>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Référence</th>
                            <th>Stock actuel</th>
                            <th>Stock minimum</th>
                            <th>État</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.lowStock.slice(0, 8).map(item => {
                            const current = Number(item.current || 0)
                            const minimum = Number(item.minimum || 0)
                            const outOfStock = current <= 0
                            return (
                              <tr key={item.id}>
                                <td><strong>{item.sku}</strong></td>
                                <td>{current}</td>
                                <td>{minimum}</td>
                                <td>
                                  <span className={`stock-alert-badge ${outOfStock ? 'out' : 'low'}`}>
                                    {outOfStock ? 'Rupture' : 'Stock faible'}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {analytics.lowStock.length > 8 && (
                      <p className="muted stock-alert-footnote">
                        Affichage de 8 variantes sur {analytics.lowStock.length}. Ouvrez Gestion du stock pour continuer.
                      </p>
                    )}
                  </>
                )}
              </section>

              <p className="muted dashboard-analytics-note">
                Les ventes sont basées sur les factures complétées. Les montants dépendent des données accessibles à votre compte.
              </p>
              {error.startsWith('Statistiques :') && <p className="error-text">{error}</p>}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div className="panel-title"><Store size={20} /><div><h2>Mes boutiques</h2><p>Choisissez une boutique ou créez-en une nouvelle.</p></div></div>
              </div>

              {stores.length > 0 && (
                <label className="field">
                  Boutique active
                  <select value={storeId} onChange={event => setStoreId(event.target.value)}>
                    {stores.map(store => (
                      <option key={store.id} value={store.id}>{store.name} — {store.currency}</option>
                    ))}
                  </select>
                </label>
              )}

              <form onSubmit={createStore} className="inline-form">
                <input
                  aria-label="Nom de la boutique"
                  placeholder="Ex. Boutique Élégance"
                  value={storeName}
                  onChange={event => setStoreName(event.target.value)}
                  required
                  maxLength={150}
                />
                <button className="primary-button" disabled={loading}>
                  <Plus size={17} /> Créer une boutique
                </button>
              </form>
            </section>

              </>
            ) : currentView === 'catalogue' ? (
              <>
            <section className="panel catalogue-panel">
              <div className="catalogue-header">
                
                <div className="panel-title"><Package size={20} /><div><h2>Catalogue des articles</h2><p>Articles enregistrés dans Supabase.</p></div></div>
                <button className="secondary-button" onClick={() => void loadProducts()} disabled={loading || !storeId}>
                  <RefreshCw size={16} /> Actualiser
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setError('')
                    setMessage('')
                    setShowProductForm(value => !value)
                  }}
                  disabled={!storeId || savingProduct}
                >
                  <Plus size={16} /> Nouveau produit
                </button>
              </div>

<div className="catalogue-scan-search">
  <label className="field">
    Recherche par code-barres / QR / SKU
    <input
      value={catalogueScanCode}
      onChange={event => setCatalogueScanCode(event.target.value)}
      placeholder="Scannez ou saisissez le code"
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          findProductByScannedCode(catalogueScanCode)
        }
      }}
    />
  </label>

  <button
    type="button"
    className="primary-button"
    onClick={() => findProductByScannedCode(catalogueScanCode)}
    disabled={!catalogueScanCode.trim()}
  >
    <Package size={16} />
    Ouvrir la fiche
  </button>
</div>

              {showProductForm && (
                <form className="product-create-form" onSubmit={saveProduct}>
                  <div className="panel-title">
                    <Plus size={20} />
                    <div>
                      <h2>{editingProductId ? 'Modifier le produit' : 'Nouveau produit'}</h2>
                      <p>Informations de l’article et déclinaisons par taille ou couleur.</p>
                    </div>
                  </div>

                  <div className="product-image-picker product-form-full">
                    <label htmlFor="product-image-file">Photo du produit</label>
                    <input
                      id="product-image-file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={event => {
                        const file = event.currentTarget.files?.[0]
                        if (!file) return
                        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                          setError('Format refusé. Choisissez une image JPG, PNG ou WebP.')
                          event.currentTarget.value = ''
                          return
                        }
                        if (file.size > 5 * 1024 * 1024) {
                          setError('La photo ne doit pas dépasser 5 Mo.')
                          event.currentTarget.value = ''
                          return
                        }
                        setError('')
                        setSelectedImageFile(file)
                        setImagePreviewUrl(URL.createObjectURL(file))
                      }}
                    />
                    {(imagePreviewUrl || existingImageUrl) && (
                      <div className="product-image-preview-wrap">
                        <img
                          className="product-image-preview"
                          src={imagePreviewUrl || existingImageUrl}
                          alt="Aperçu du produit"
                        />
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            setSelectedImageFile(null)
                            setImagePreviewUrl('')
                            setExistingImageUrl('')
                            const input = document.getElementById('product-image-file') as HTMLInputElement | null
                            if (input) input.value = ''
                          }}
                          disabled={savingProduct}
                        >
                          Retirer la photo
                        </button>
                      </div>
                    )}
                    <small>JPG, PNG ou WebP — 5 Mo maximum. L’ancienne photo reste conservée si vous ne choisissez pas une nouvelle image.</small>
                  </div>

                  <div className="product-form-grid">
                    <label>
                      Nom du produit *
                      <input
                        value={productName}
                        onChange={e => setProductName(e.target.value)}
                        placeholder="Ex. T-shirt classique"
                        maxLength={150}
                        required
                      />
                    </label>

                    <label>
                      Public cible *
                      <select
                        value={targetAudience}
                        onChange={e => setTargetAudience(e.target.value)}
                        required
                      >
                        <option value="women">Femme</option>
                        <option value="men">Homme</option>
                        <option value="unisex">Mixte</option>
                        <option value="children">Enfant</option>
                      </select>
                    </label>

                    <label>
                      Catégorie
                      <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                        <option value="">Sans catégorie</option>
                        {categories.map(category => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Marque
                      <select value={brandId} onChange={e => setBrandId(e.target.value)}>
                        <option value="">Sans marque</option>
                        {brands.map(brand => (
                          <option key={brand.id} value={brand.id}>{brand.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="product-form-full">
                      Description
                      <textarea
                        value={productDescription}
                        onChange={e => setProductDescription(e.target.value)}
                        placeholder="Description du produit"
                        rows={3}
                      />
                    </label>
                  </div>

                  <div className="product-variants-heading">
                    <div>
                      <h3>Tailles, couleurs et prix</h3>
                      <p>Ajoutez une ligne par déclinaison avec un SKU unique.</p>
                    </div>
                    <div className="product-variant-actions">
                      <button type="button" className="secondary-button" onClick={addVariantDraft}>
                        <Plus size={16} /> Déclinaison vierge
                      </button>
                      <button type="button" className="secondary-button" onClick={() => duplicateVariantDraft(0)} disabled={variantDrafts.length === 0}>
                        Dupliquer la première
                      </button>
                    </div>
                  </div>

                  {variantDrafts.map((variant, index) => (
                    <div className="product-variant-row" key={index}>
                      <label>
                        SKU *
                        <input
                          value={variant.sku}
                          onChange={e => updateVariantDraft(index, 'sku', e.target.value)}
                          placeholder="TSH-BLK-M"
                          required
                        />
                      </label>

                      <label>
                        Code-barres
                        <input
                          value={variant.barcode}
                          onChange={e => updateVariantDraft(index, 'barcode', e.target.value)}
                          placeholder="EAN / code-barres"
                        />
                      </label>

                      <label>
                        Taille
                        <input
                          value={variant.size}
                          onChange={e => updateVariantDraft(index, 'size', e.target.value)}
                          placeholder="S, M, L, 38..."
                        />
                      </label>

                      <label>
                        Couleur
                        <input
                          value={variant.color}
                          onChange={e => updateVariantDraft(index, 'color', e.target.value)}
                          placeholder="Noir, blanc..."
                        />
                      </label>

                      <label>
                        Prix d’achat *
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.purchase_cost}
                          onChange={e => updateVariantDraft(index, 'purchase_cost', e.target.value)}
                          required
                        />
                      </label>

                      <label>
                        Prix de vente *
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={variant.sale_price}
                          onChange={e => updateVariantDraft(index, 'sale_price', e.target.value)}
                          required
                        />
                      </label>
                      <div className="variant-margin">
                        <span>Marge brute estimée</span>
                        <strong>
                          {(Number(variant.sale_price || 0) - Number(variant.purchase_cost || 0)).toFixed(2)}
                        </strong>
                        <small>
                          {Number(variant.sale_price) > 0
                            ? `Taux : ${((Number(variant.sale_price) - Number(variant.purchase_cost)) / Number(variant.sale_price) * 100).toFixed(1)} %`
                            : 'Saisissez un prix de vente'}
                        </small>
                      </div>

                      <label>
                        Stock minimum
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={variant.min_stock}
                          onChange={e => updateVariantDraft(index, 'min_stock', e.target.value)}
                          required
                        />
                      </label>
                    </div>
                  ))}

                  <div className="product-form-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={resetProductForm}
                      disabled={savingProduct}
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={savingProduct || !storeId}
                    >
                      {savingProduct ? 'Enregistrement…' : 'Enregistrer le produit'}
                    </button>
                  </div>
                </form>
              )}

              <div className="catalogue-tools catalogue-tools-enhanced">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="Rechercher par article, marque ou catégorie…"
                    aria-label="Rechercher un article"
                  />
                  {search.trim() && (
                    <button type="button" className="catalogue-clear-search" onClick={() => setSearch('')} aria-label="Effacer la recherche">
                      Effacer
                    </button>
                  )}
                </div>
                <span className="catalogue-result-count">
                  {filteredProducts.length} article{filteredProducts.length !== 1 ? 's' : ''}
                  {search.trim() ? ' trouvé(s)' : ' au catalogue'}
                </span>
                <div className="catalogue-view-switch" role="group" aria-label="Affichage du catalogue">
                  <button type="button" className={catalogueLayout === 'grid' ? 'view-switch-button selected' : 'view-switch-button'} onClick={() => setCatalogueLayout('grid')} aria-pressed={catalogueLayout === 'grid'}>Cartes</button>
                  <button type="button" className={catalogueLayout === 'table' ? 'view-switch-button selected' : 'view-switch-button'} onClick={() => setCatalogueLayout('table')} aria-pressed={catalogueLayout === 'table'}>Tableau</button>
                </div>
              </div>

              {!storeId ? (
                <div className="empty-state"><Store size={34} /><strong>Aucune boutique sélectionnée</strong><p>Créez une boutique ou vérifiez vos accès.</p></div>
              ) : loading ? (
                <div className="empty-state"><RefreshCw size={25} className="spin" /><p>Chargement des données…</p></div>
              ) : filteredProducts.length === 0 ? (
                <div className="empty-state"><Package size={34} /><strong>Aucun article trouvé</strong><p>Le catalogue est vide ou aucun résultat ne correspond à votre recherche.</p></div>
              ) : (
                catalogueLayout === 'table' ? (
                  <div className="table-wrap"><table>
                    <thead><tr><th>Article</th><th>Public</th><th>Statut</th><th>Actions</th></tr></thead>
                    <tbody>{filteredProducts.map(product => (
                      <tr key={product.id}>
                        <td><div className="product-name"><div className="product-mini-icon"><Shirt size={17} /></div><strong>{product.name}</strong></div></td>
                        <td>{product.target_audience || 'Non défini'}</td>
                        <td><span className={product.active ? 'status-pill active-pill' : 'status-pill inactive-pill'}>{product.active ? 'Actif' : 'Archivé'}</span></td>
                        <td>
                          <div className="product-variant-actions">
                            <button type="button" className="secondary-button" onClick={() => void openProductEditor(product.id)} disabled={loading || savingProduct}><Pencil size={15} /> Modifier</button>
                            <button type="button" className="secondary-button" onClick={() => void openProductEditor(product.id, true)} disabled={loading || savingProduct}><Copy size={15} /> Dupliquer</button>
                            {product.active && <button type="button" className="secondary-button" onClick={() => void archiveProduct(product)} disabled={loading || savingProduct}><Package size={15} /> Archiver</button>}
                            {!product.active && <button type="button" className="secondary-button" onClick={() => void restoreProduct(product)} disabled={loading || savingProduct}><RotateCcw size={15} /> Restaurer</button>}
                          </div>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                ) : (
                  <div className="catalogue-product-grid">
                    {filteredProducts.map(product => {
                      const variants = posVariants.filter(v => v.product_id === product.id)
                      const prices = variants.map(v => Number(v.sale_price)).filter(price => Number.isFinite(price) && price >= 0)
                      const sizes = [...new Set(variants.map(v => v.size).filter((v): v is string => Boolean(v?.trim())))]
                      const colors = [...new Set(variants.map(v => v.color).filter((v): v is string => Boolean(v?.trim())))]
                      const stock = variants.reduce((sum, v) => sum + (posStocks[v.id] ?? 0), 0)
                      const minimum = variants.reduce((sum, v) => sum + Number(v.min_stock ?? 0), 0)
                      const currency = stores.find(store => store.id === storeId)?.currency || 'DZD'
                      const formatPrice = (value: number) => `${value.toLocaleString('fr-DZ', { maximumFractionDigits: 2 })} ${currency}`
                      const low = variants.length > 0 && stock <= minimum
                      return (
                        <article className="catalogue-product-card" key={product.id}>
                          <div className="catalogue-card-visual">
                            {product.image_url ? (
                              <img className="catalogue-card-image" src={product.image_url} alt={product.name} loading="lazy" />
                            ) : (
                              <div className="catalogue-card-icon"><Shirt size={34} /></div>
                            )}
                            <span className={product.active ? 'status-pill active-pill' : 'status-pill inactive-pill'}>{product.active ? 'Actif' : 'Archivé'}</span>
                          </div>
                          <div className="catalogue-card-content">
                            <h3>{product.name}</h3>
                            <p className="catalogue-card-audience">{product.target_audience || 'Public non défini'}</p>
                            <div className="catalogue-card-price">
                              {prices.length === 0 ? 'Prix non défini' : prices.length === 1 ? formatPrice(prices[0]) : `${formatPrice(Math.min(...prices))} – ${formatPrice(Math.max(...prices))}`}
                            </div>
                            <div className="catalogue-card-detail"><strong>Tailles</strong><span>{sizes.length ? sizes.join(', ') : 'Non définies'}</span></div>
                            <div className="catalogue-card-detail"><strong>Couleurs</strong><span>{colors.length ? colors.join(', ') : 'Non définies'}</span></div>
                            <div className="catalogue-card-stock">
                              <span>Stock total</span><strong>{variants.length ? stock : '—'}</strong>
                              {variants.length > 0 && <span className={stock <= 0 ? 'catalogue-stock-badge out' : low ? 'catalogue-stock-badge low' : 'catalogue-stock-badge ok'}>{stock <= 0 ? 'Rupture' : low ? 'Stock faible' : 'Disponible'}</span>}
                            </div>
                            {variants.length === 0 && <p className="catalogue-no-variant">Aucune variante active</p>}
                          </div>
                          <div className="catalogue-card-actions">
                            <button type="button" className="secondary-button" onClick={() => void openProductEditor(product.id)} disabled={loading || savingProduct}><Pencil size={15} /> Modifier</button>
                            <button type="button" className="secondary-button" onClick={() => void openProductEditor(product.id, true)} disabled={loading || savingProduct}><Copy size={15} /> Dupliquer</button>
                            {product.active ? (
                              <button type="button" className="secondary-button" onClick={() => void archiveProduct(product)} disabled={loading || savingProduct}><Package size={15} /> Archiver</button>
                            ) : (
                              <button type="button" className="secondary-button" onClick={() => void restoreProduct(product)} disabled={loading || savingProduct}><RotateCcw size={15} /> Restaurer</button>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>


                               )
              )}

              {scannedProductId && (() => {
                const product = products.find(p => p.id === scannedProductId)
                const variant = posVariants.find(v => v.id === scannedVariantId)

                if (!product) return null

                const currency = stores.find(s => s.id === storeId)?.currency || 'DZD'
                const stock = variant ? (posStocks[variant.id] ?? 0) : 0

                return (
                  <div className="scan-product-detail">
                    <div className="scan-product-detail-header">
                      <h3>Fiche produit</h3>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setScannedProductId(null)
                          setScannedVariantId(null)
                        }}
                      >
                        Fermer
                      </button>
                    </div>

                    <div className="scan-product-detail-body">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} />
                      ) : (
                        <div className="scan-product-placeholder">
                          <Shirt size={42} />
                        </div>
                      )}

                      <div className="scan-product-information">
                        <h2>{product.name}</h2>
                        <p>{product.description || 'Aucune description disponible.'}</p>
                        <p><strong>Public :</strong> {product.target_audience || 'Non défini'}</p>

                        {variant && (
                          <>
                            <p><strong>SKU :</strong> {variant.sku}</p>
                            <p><strong>Code-barres :</strong> {variant.barcode || 'Non défini'}</p>
                            <p><strong>QR :</strong> {variant.qr_token || 'Non défini'}</p>
                            <p><strong>Taille :</strong> {variant.size || 'Non définie'}</p>
                            <p><strong>Couleur :</strong> {variant.color || 'Non définie'}</p>
                            <p>
                              <strong>Prix :</strong>{' '}
                              {Number(variant.sale_price).toLocaleString('fr-DZ')} {currency}
                            </p>
                            <p><strong>Stock :</strong> {stock}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </section>
              </>
            ) : null}
          </section>
        </div>
      )}

      <footer className="footer">
        <span>© {new Date().getFullYear()} StylePro Manager</span>
        <span>Gestion commerciale <i>•</i> Sécurisée par Supabase</span>
      </footer>
    </main>
  )
}
