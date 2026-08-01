import React, { useMemo, useState } from 'react';
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import MaterialIcons from "@react-native-vector-icons/material-icons";
import { useTheme } from './ThemeContext';

export interface DropdownItem {
    label: string;
    value: string;
}

interface DropdownProps {
    label?: string;
    value: string;
    items: DropdownItem[];
    onChange(value: string): void;
    placeholder?: string;
}

export default function Dropdown({
    label,
    value,
    items,
    onChange,
    placeholder = 'Выберите...',
}: DropdownProps) {
    const { theme } = useTheme();
    const [open, setOpen] = useState(false);

    const selected = useMemo(
        () => items.find(i => i.value === value),
        [items, value]
    );

    return (
        <>
            {label && (
                <Text style={[styles.label, { color: theme.muted }]}>
                    {label}
                </Text>
            )}

            <Pressable
                onPress={() => setOpen(true)}
                style={[
                    styles.field,
                    {
                        backgroundColor: theme.surfaceElevated,
                        borderColor: theme.outline,
                    },
                ]}
            >
                <Text
                    style={{
                        color: selected ? theme.text : theme.muted,
                        flex: 1,
                        fontSize: 16,
                    }}
                    numberOfLines={1}
                >
                    {selected?.label ?? placeholder}
                </Text>

                <MaterialIcons
                    name="expand-more"
                    size={24}
                    color={theme.muted}
                />
            </Pressable>

            <Modal
                visible={open}
                transparent
                animationType="fade"
                onRequestClose={() => setOpen(false)}
            >
                <Pressable
                    style={styles.overlay}
                    onPress={() => setOpen(false)}
                >
                    <View
                        style={[
                            styles.menu,
                            {
                                backgroundColor: theme.surface,
                            },
                        ]}
                    >
                        <ScrollView>
                            {items.map(item => {
                                const active = item.value === value;

                                return (
                                    <Pressable
                                        key={item.value}
                                        onPress={() => {
                                            onChange(item.value);
                                            setOpen(false);
                                        }}
                                        style={[
                                            styles.item,
                                            active && {
                                                backgroundColor: theme.primaryContainer,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={{
                                                color: active ? theme.onPrimaryContainer : theme.text,
                                                fontSize: 16,
                                            }}
                                        >
                                            {item.label}
                                        </Text>

                                        {active && (
                                            <MaterialIcons
                                                name="check"
                                                size={20}
                                                color={theme.onPrimaryContainer}
                                            />
                                        )}
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    label: {
        marginBottom: 6,
        marginLeft: 4,
        fontSize: 13,
        fontWeight: '500',
    },

    field: {
        height: 56,
        borderRadius: 16,
        borderWidth: 1.5,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },

    overlay: {
        flex: 1,
        backgroundColor: '#00000066',
        justifyContent: 'center',
        padding: 24,
    },

    menu: {
        borderRadius: 20,
        overflow: 'hidden',
        maxHeight: 400,
        elevation: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
    },

    item: {
        height: 52,
        paddingHorizontal: 18,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
});