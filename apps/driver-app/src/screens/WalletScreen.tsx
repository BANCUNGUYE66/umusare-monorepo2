import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabaseClient } from '../lib/supabaseClient';
import GlassSurface from '../components/GlassSurface';

interface WalletTransaction {
  id: string;
  amount_gross: number;
  commission_fee: number;
  amount_net: number;
  created_at?: string;
  trip_id?: string;
}

interface WalletScreenProps {
  onCommissionCleared?: () => void;
}

export default function WalletScreen({ onCommissionCleared }: WalletScreenProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [commissionDue, setCommissionDue] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

  const loadWallet = useCallback(async () => {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return;

    setLoading(true);
    try {
      const [{ data: profile }, { data: txRows }] = await Promise.all([
        supabaseClient
          .from('profiles')
          .select('wallet_balance, commission_due')
          .eq('id', userId)
          .single(),
        supabaseClient
          .from('transactions')
          .select('*')
          .eq('driver_id', userId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      setWalletBalance(Number((profile as any)?.wallet_balance ?? 0));
      setCommissionDue(Number((profile as any)?.commission_due ?? 0));
      setTransactions((txRows as WalletTransaction[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const handleClearCommission = async () => {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (!userId) return;

    setClearing(true);
    try {
      const { error } = await supabaseClient
        .from('profiles')
        .update({ commission_due: 0 })
        .eq('id', userId);
      if (!error) {
        await loadWallet();
        onCommissionCleared?.();
      }
    } finally {
      setClearing(false);
    }
  };

  return (
    <View style={styles.root}>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: 56, paddingBottom: insets.bottom + 100 },
        ]}
        ListHeaderComponent={
          <>
            <Text style={styles.screenTitle}>Wallet</Text>
            <Text style={styles.screenSubtitle}>Earnings and commission</Text>

            <GlassSurface style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Wallet balance</Text>
              <Text style={styles.balanceValue}>{walletBalance.toLocaleString()} RWF</Text>
            </GlassSurface>

            <GlassSurface style={styles.commissionCard}>
              <Text style={styles.commissionLabel}>Commission due</Text>
              <Text style={styles.commissionValue}>{commissionDue.toLocaleString()} RWF</Text>
              <Text style={styles.commissionHint}>
                Deposit to Mobile Money: 0788 000 111 before taking the next trip.
              </Text>
              {commissionDue > 0 ? (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={handleClearCommission}
                  disabled={clearing}
                >
                  <Text style={styles.clearButtonText}>
                    {clearing ? 'Processing…' : 'I have deposited commission'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.commissionClearText}>Commission cleared. You can go online.</Text>
              )}
            </GlassSurface>

            <Text style={styles.sectionTitle}>Recent trips</Text>
            {loading ? (
              <ActivityIndicator style={styles.loader} color="#2563EB" />
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <GlassSurface style={styles.txRow}>
            <View>
              <Text style={styles.txTitle}>Trip {item.trip_id?.slice(0, 8) ?? 'N/A'}</Text>
              <Text style={styles.txSub}>
                Fee {Number(item.commission_fee ?? 0).toLocaleString()} RWF
              </Text>
            </View>
            <Text style={styles.txAmount}>+{Number(item.amount_net ?? 0).toLocaleString()} RWF</Text>
          </GlassSurface>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>No completed trips yet.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#eef1f6',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 15,
    color: '#64748B',
    marginTop: 6,
    marginBottom: 18,
  },
  balanceCard: {
    borderRadius: 22,
    padding: 20,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(37,99,235,0.2)',
    backgroundColor: 'rgba(239,246,255,0.9)',
  },
  balanceLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  balanceValue: {
    color: '#0f172a',
    fontSize: 32,
    fontWeight: '800',
  },
  commissionCard: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 22,
  },
  commissionLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  commissionValue: {
    color: '#b45309',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 6,
  },
  commissionHint: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 10,
    marginBottom: 12,
    lineHeight: 18,
  },
  clearButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  commissionClearText: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
  },
  loader: {
    marginVertical: 16,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  txTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  txSub: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  txAmount: {
    color: '#16a34a',
    fontSize: 15,
    fontWeight: '800',
  },
  empty: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
  },
});
