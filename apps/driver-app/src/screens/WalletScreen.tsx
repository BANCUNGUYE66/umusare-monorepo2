import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { supabaseClient } from '../lib/supabaseClient';

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
    <View style={styles.container}>
      <LinearGradient
        colors={['#0047AB', '#142850']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <Text style={styles.balanceLabel}>Wallet Balance</Text>
        <Text style={styles.balanceValue}>{walletBalance.toLocaleString()} RWF</Text>
      </LinearGradient>

      <View style={styles.commissionCard}>
        <Text style={styles.commissionLabel}>Commission Due</Text>
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
              {clearing ? 'Processing...' : 'I have deposited commission'}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.commissionClearText}>Commission cleared. You can go online.</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Recent Trips</Text>
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.txRow}>
              <View>
                <Text style={styles.txTitle}>Trip {item.trip_id?.slice(0, 8) ?? 'N/A'}</Text>
                <Text style={styles.txSub}>
                  Fee {Number(item.commission_fee ?? 0).toLocaleString()} RWF
                </Text>
              </View>
              <Text style={styles.txAmount}>
                +{Number(item.amount_net ?? 0).toLocaleString()} RWF
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No completed trips yet.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A174E',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  card: {
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
  },
  balanceLabel: {
    color: '#D1D5DB',
    fontSize: 14,
    marginBottom: 8,
  },
  balanceValue: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#F5F5F5',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  commissionCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  commissionLabel: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  commissionValue: {
    color: '#F59E0B',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  commissionHint: {
    color: '#E5E7EB',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 10,
  },
  clearButton: {
    backgroundColor: '#0047AB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  commissionClearText: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '600',
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  txTitle: {
    color: '#F5F5F5',
    fontSize: 14,
    fontWeight: '600',
  },
  txSub: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  txAmount: {
    color: '#22C55E',
    fontSize: 14,
    fontWeight: '700',
  },
  empty: {
    color: '#9CA3AF',
    fontSize: 14,
    marginTop: 8,
  },
});
