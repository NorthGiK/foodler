import React from 'react';
import {
    Pressable,
    Text,
    View
} from 'react-native';
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { StyleSheet } from 'react-native';
import { Theme } from '@/themes';
import { useTheme } from './ThemeContext';

type AnalysisCoundownProps = {
}

export default function AnalysisCountdown({
}: AnalysisCoundownProps) {
    const { theme } = useTheme();
    const styles = getStyles(theme);

    return (
        <Pressable style={[ styles.reportCard, {backgroundColor: theme.surface} ]}>
            <MaterialIcons
                name="description"
                size={34}
                color={theme.primary}
            />

            <View style={{ flex: 1, marginLeft: 16 }}>
                <Text style={[ styles.reportTitle, {color: theme.text} ]}>
                    Общий анализ
                </Text>

                <Text
                style={{
                    color: theme.muted,
                    marginTop: 2,
                }}>
                    Вчера · 38 чеков
                </Text>
            </View>

            <MaterialIcons
                name="chevron-right"
                size={28}
                color={theme.muted}
            />
        </Pressable>
    )
}

const getStyles = (theme: Theme) => StyleSheet.create({
    reportCard: {
        borderRadius: 24,
        padding: 18,
        flexDirection: 'row',
        alignItems: 'center',
        elevation: 2,
    },

    reportTitle: {
        fontSize: 18,
        fontWeight: '600',
    },
})