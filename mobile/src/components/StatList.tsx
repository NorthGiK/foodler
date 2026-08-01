import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from './ThemeContext';
import { Theme } from '@/themes';

interface StatListProps {
    title: string;
    data: Array<{ label: string; value: number }>;
}

export function StatList({ title, data }: StatListProps) {
    const { theme } = useTheme();
    const styles = getStyles(theme);
    return (
        <View style={styles.card}>
            <Text style={styles.title}>{title}</Text>
            {data.length === 0 ? (
                <Text style={styles.empty}>Нет данных</Text>
            ) : (
                data.slice(0, 8).map((row, i) => (
                    <View key={`${row.label}-${i}`} style={styles.row}>
                        <Text style={styles.label}>{row.label}</Text>
                        <Text style={styles.value}>{row.value.toFixed(0)}</Text>
                    </View>
                ))
            )}
        </View>
    );
}

const getStyles = (theme: Theme) => StyleSheet.create({
    card: {
        backgroundColor: theme.surface,
        borderRadius: 20,
        padding: 16,
        marginTop: 16,
        ...shadow(2, theme),
    },
    title: { color: theme.text, fontSize: 16, fontWeight: '600', marginBottom: 12 },
    empty: { color: theme.muted },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    label: { color: theme.text, flex: 1, fontWeight: '500' },
    value: { color: theme.primary, fontWeight: '700' },
});

function shadow(elevation: number, theme: Theme) {
    return {
        elevation,
        shadowColor: theme.shadow,
        shadowOffset: { width: 0, height: elevation / 2 },
        shadowOpacity: 0.2,
        shadowRadius: elevation,
    };
}