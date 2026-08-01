import React from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useTheme } from '../components/ThemeContext';
import FullModalWindow from '@/components/FullModalWindow';
import { AiActionType } from '../ai/types';

export type QuickActionsProps = {
    quickActionsVisible: boolean,
    setQuickActionsVisible: React.Dispatch<React.SetStateAction<boolean>>,
    onAction?: (action: AiActionType) => void,
}

export function QuickActionsScreen({ quickActionsVisible, setQuickActionsVisible, onAction }: QuickActionsProps) {
    const { theme } = useTheme();

    const handleAction = (action: AiActionType) => {
        setQuickActionsVisible(false);
        onAction?.(action);
    };

    return (
        <FullModalWindow
            visible={quickActionsVisible}
            setVisible={setQuickActionsVisible}
        >
            <ScrollView
                style={{ flex: 1, backgroundColor: theme.bg }}
                contentContainerStyle={styles.content}
            >
                <View style={{flexDirection: 'row', justifyContent: "space-between"}} >
                    <View>
                        <Text style={[ styles.title, {color: theme.text} ]}>
                            Быстрые
                        </Text>
                        <Text style={[ styles.title, {color: theme.text }]}>
                            Действия
                        </Text>

                        <Text style={[ styles.subtitle, {color: theme.muted, width: 'auto'} ]}
                        >
                            Что хотите сделать?
                        </Text>
                    </View>

                    <Pressable onPress={() => setQuickActionsVisible(false)}>
                        <MaterialIcons
                            name='close'
                            size={38}
                            color={theme.text}
                            style={{
                                padding: 3,
                                width: "100%",
                                height: "auto",
                            }}
                        />
                    </Pressable>
                </View>

                <BigCard
                    title="Оценить покупки"
                    description="Получить полный анализ последних чеков"
                    icon="analytics"
                    color="#6366F1"
                    onPress={() => handleAction('analysis')}
                />

                <View style={styles.row}>
                    <SmallCard
                        title="Сэкономить"
                        icon="savings"
                        color="#10B981"
                        onPress={() => handleAction('save_money')}
                    />

                    <SmallCard
                        title="Полезнее"
                        icon="favorite"
                        color="#EF4444"
                        onPress={() => handleAction('health')}
                    />
                </View>

                <View style={styles.row}>
                    <SmallCard
                        title="Рецепты"
                        icon="restaurant"
                        color="#F59E0B"
                        onPress={() => handleAction('recipe')}
                    />

                    <SmallCard
                        title="Состав"
                        icon="science"
                        color="#3B82F6"
                        onPress={() => handleAction('ingredients')}
                    />
                </View>

                <View style={styles.row}>
                    <SmallCard
                        title="Корзина"
                        icon="shopping-cart"
                        color="#8B5CF6"
                        onPress={() => handleAction('cart')}
                    />

                    <SmallCard
                        title="Заканчивается"
                        icon="schedule"
                        color="#F97316"
                        onPress={() => handleAction('habits')}
                    />
                </View>
            </ScrollView>
        </FullModalWindow>
    );
}

function BigCard(props: any) {
    const { theme } = useTheme();

    return (
        <Pressable
            android_ripple={{ color: '#00000015' }}
            onPress={props.onPress}
            style={[
                styles.bigCard,
                {
                    backgroundColor: theme.surface,
                },
            ]}
        >
            <View
                style={[
                    styles.icon,
                    {
                        backgroundColor: props.color + '22',
                    },
                ]}
            >
                <MaterialIcons
                    name={props.icon}
                    size={34}
                    color={props.color}
                />
            </View>

            <View style={{ flex: 1 }}>
                <Text
                    style={[
                        styles.cardTitle,
                        {
                            color: theme.text,
                        },
                    ]}
                >
                    {props.title}
                </Text>

                <Text
                    style={[
                        styles.cardSubtitle,
                        {
                            color: theme.muted,
                        },
                    ]}
                >
                    {props.description}
                </Text>
            </View>

            <MaterialIcons
                name="chevron-right"
                size={28}
                color={theme.muted}
            />
        </Pressable>
    );
}

function SmallCard(props: any) {
    const { theme } = useTheme();

    return (
        <Pressable
            android_ripple={{ color: '#00000015' }}
            onPress={props.onPress}
            style={[
                styles.smallCard,
                {
                    backgroundColor: theme.surface,
                },
            ]}
        >
            <View
                style={[
                    styles.smallIcon,
                    {
                        backgroundColor: props.color + '22',
                    },
                ]}
            >
                <MaterialIcons
                    name={props.icon}
                    size={26}
                    color={props.color}
                />
            </View>

            <Text
                style={[
                    styles.smallTitle,
                    {
                        color: theme.text,
                    },
                ]}
            >
                {props.title}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    content: {
        padding: 20,
    },

    title: {
        fontSize: 30,
        fontWeight: '700',
    },

    subtitle: {
        marginTop: 6,
        marginBottom: 24,
        fontSize: 16,
    },

    bigCard: {
        borderRadius: 28,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 18,
        elevation: 2,
    },

    icon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 18,
    },

    cardTitle: {
        fontSize: 20,
        fontWeight: '600',
    },

    cardSubtitle: {
        marginTop: 6,
        fontSize: 14,
        lineHeight: 20,
    },

    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },

    smallCard: {
        width: '48%',
        borderRadius: 24,
        padding: 18,
        elevation: 2,
    },

    smallIcon: {
        width: 52,
        height: 52,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 18,
    },

    smallTitle: {
        fontSize: 17,
        fontWeight: '600',
    },
});