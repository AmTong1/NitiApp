import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, TextInput, RefreshControl } from 'react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { BASE_HOST, BASE_PORT } from './config.ts';
import { apiFetchJson } from '../lib/api';
import debounce from 'lodash/debounce';

type Props = { darkMode: boolean; onSelectHouse?: (houseNumber: string) => void };

type Status = 'paid' | 'pending' | 'overdue';

type Item = {
  houseNumber: string;
  status: Status;
};

type LatestInstallmentRow = {
  house_number: string;
  status: Status;                 // 'paid' | 'pending' | 'overdue'
  installment_no?: number;
  payment_id?: number;
  due_date?: string;
  period_start?: string;
  period_end?: string;
};

const ANDROID_HOST = BASE_HOST;
export function getBaseUrl() {
  const host = Platform.OS === 'android' ? ANDROID_HOST : BASE_HOST;
  return `http://${host}:${BASE_PORT}`;
}

const statusLabel: Record<Status, string> = {
  paid: 'ชำระแล้ว',
  pending: 'รอชำระ',
  overdue: 'ค้างชำระ',
};

const statusColor: Record<Status, string> = {
  paid: '#26C281',     // เขียว
  pending: '#FFD34D',  // เหลือง
  overdue: '#F05454',  // แดง
};

const statusTextColor: Record<Status, string> = {
  paid: '#073B1A',
  pending: '#5A4500',
  overdue: '#5E0000',
};

const MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const PaymentStatus: React.FC<Props> = ({ darkMode, onSelectHouse }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [searchText, setSearchText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);

  // Month/Year Selection
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  // Stats
  const counts = useMemo(() => {
    return items.reduce(
      (acc, cur) => {
        acc[cur.status] += 1; return acc;
      },
      { paid: 0, pending: 0, overdue: 0 } as Record<Status, number>
    );
  }, [items]);

  const colors = {
    bg: darkMode ? '#0E0E0E' : '#FFFFFF',
    text: darkMode ? '#EDEDED' : '#333333',
    cardShadow: darkMode ? 'transparent' : '#000',
    border: darkMode ? '#2A2A2A' : '#F0F0F0',
    primary: '#4F46E5',
    subtext: darkMode ? '#9CA3AF' : '#6B7280',
  };

  // Main fetch function
  const fetchStatus = useCallback(async (q: string, m?: number, y?: number) => {
     try {
       setLoading(true);
       setError(null);
       const base = getBaseUrl();
       const queryParam = q?.trim() || '';

       // Param construction
       const params = new URLSearchParams();
       if (queryParam) params.append('search', queryParam);
       if (m) params.append('month', String(m));
       if (y) params.append('year', String(y));

       const url = `${base}/payment-installments/latest?${params.toString()}`;
       const latest = await apiFetchJson(url);

       if (latest.res.ok && Array.isArray(latest.json?.data)) {
         const rows: LatestInstallmentRow[] = latest.json.data;
         const mapped: Item[] = rows
           .map((r) => {
             const hn = String(r.house_number || '').trim();
             const st = r.status;
             if (!hn) return null;
             // ถ้ามี month/year ที่เลือก Status ควรจะสะท้อนตามงวดที่ได้มา
             // ซึ่ง backend กรองมาให้แล้วว่าคืองวดที่ cover เดือนนั้น
             // ดังนั้น status ของงวดนั้นก็คือสถานะของเดือนนั้น
             return {
               houseNumber: hn,
               status: st === 'paid' || st === 'pending' || st === 'overdue' ? st : 'pending',
             } as Item;
           })
           .filter(Boolean) as Item[];
         setItems(mapped);
         return;
       }

       // Fallback logic removed for clarity as per backend changes
       setItems([]);
     } catch (e: any) {
       setError((e as any)?.message || 'โหลดข้อมูลไม่สำเร็จ');
     } finally {
       setLoading(false);
     }
   }, []);

   // Debounced fetch for search text
   const debouncedFetch = useMemo(
      () => debounce((q: string, m: number, y: number) => {
          fetchStatus(q, m, y);
      }, 500),
      [fetchStatus]
   );

   // Effect: Trigger fetch when search or filters change
   useEffect(() => {
      debouncedFetch(searchText, selectedMonth, selectedYear);
      return () => debouncedFetch.cancel();
   }, [searchText, selectedMonth, selectedYear, debouncedFetch]);

  const visibleItems = useMemo(() => {
    let list = items;
    if (statusFilter) list = list.filter(it => it.status === statusFilter);
    return list;
  }, [items, statusFilter]);

  const onClear = () => {
    setSearchText('');
  };

  const handleMonthChange = (delta: number) => {
    let newM = selectedMonth + delta;
    let newY = selectedYear;
    if (newM > 12) { newM = 1; newY++; }
    if (newM < 1) { newM = 12; newY--; }
    setSelectedMonth(newM);
    setSelectedYear(newY);
  };

  const setToday = () => {
      const d = new Date();
      setSelectedMonth(d.getMonth() + 1);
      setSelectedYear(d.getFullYear());
  };

  const renderLegend = () => (
    <View style={styles.legendRow}>
      {(['paid', 'pending', 'overdue'] as Status[]).map((s) => {
        const active = statusFilter === s;
        return (
          <TouchableOpacity
            key={s}
            onPress={() => setStatusFilter(prev => (prev === s ? null : s))}
            style={[styles.legendItem, active && styles.legendItemActive]}
          >
            <View style={[styles.legendDot, { backgroundColor: statusColor[s] }]} />
            <Text style={[styles.legendText, active ? styles.legendTextActive : { color: colors.text }]}>
              {statusLabel[s]} ({counts[s]})
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const onRefreshPull = useCallback(async () => {
    setRefreshing(true);
    await fetchStatus(searchText, selectedMonth, selectedYear);
    setRefreshing(false);
  }, [fetchStatus, searchText, selectedMonth, selectedYear]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}> 
      {/* Search & Filters */}
      <View style={styles.filtersContainer}>
        {/* Row: Search + Month nav + Today btn */}
        <View style={styles.searchRow}>
          <View style={styles.inputWrap}>
            <Ionicons name="search" size={18} color={colors.subtext} style={styles.searchIcon} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="ค้นหาเลขที่บ้าน"
              placeholderTextColor={colors.subtext}
              style={[styles.input, { color: colors.text, borderColor: colors.border }]}
              keyboardType="number-pad"
              inputMode="numeric"
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity accessibilityLabel="clear search" onPress={onClear} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={18} color={colors.subtext} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Row: Month nav + Today btn */}
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => handleMonthChange(-1)} style={styles.monthNavBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.monthText, { color: colors.text }]}>
            {MONTHS[selectedMonth - 1]} {selectedYear + 543}
          </Text>
          <TouchableOpacity onPress={() => handleMonthChange(1)} style={styles.monthNavBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={setToday} style={[styles.todayBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.todayBtnText}>เดือนปัจจุบัน</Text>
          </TouchableOpacity>
        </View>
      </View>

      {renderLegend()}
      
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>เกิดข้อผิดพลาด: {error}</Text>
        </View>
      ) : null}

      <FlatList
        data={visibleItems}
        keyExtractor={(it, idx) => `${it.houseNumber}-${idx}`}
        numColumns={3}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefreshPull} />
        }
        renderItem={({ item }) => (
          <View style={[styles.cellWrap]}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                onSelectHouse?.(item.houseNumber);
              }}
              style={[
                styles.cell,
                { backgroundColor: statusColor[item.status], shadowColor: colors.cardShadow }
              ]}
            >
              <Text style={[styles.cellTitle, { color: statusTextColor[item.status] }]}>บ้านเลขที่</Text>
              <Text style={[styles.cellValue, { color: statusTextColor[item.status] }]}>{item.houseNumber}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      {(!loading && visibleItems.length === 0) && (
        <View style={styles.emptyContainer}>
          <Text style={{ color: colors.text }}>ไม่พบบ้านเลขที่ที่ค้นหา</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filtersContainer: {
    marginBottom: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
    marginBottom: 8,
    gap: 6,
  },
  searchRow: {
    marginBottom: 8,
  },
  inputWrap: {
    position: 'relative',
  },
  searchIcon: {
    position: 'absolute', 
    left: 12, 
    top: 12, 
    zIndex: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    paddingRight: 32,
    paddingLeft: 38,
  },
  clearBtn: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthNavBtn: {
    padding: 8,
  },
  monthText: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 4,
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  legendItemActive: { backgroundColor: '#EEF7EE', borderColor: '#2E7D32' },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    fontSize: 13,
    fontWeight: '600',
  },
  legendTextActive: { color: '#2E7D32', fontWeight: '800' },
  errorContainer: {
    paddingVertical: 10,
  },
  errorText: {
    color: '#C62828',
  },
  row: {
    justifyContent: 'space-between',
  },
  listContent: {
    paddingBottom: 24,
  },
  cellWrap: {
    flex: 1,
    padding: 6,
  },
  cell: {
    height: 90,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cellTitle: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.8,
    marginBottom: 4,
  },
  cellValue: {
    fontSize: 20,
    fontWeight: '900',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
});

export default PaymentStatus;
