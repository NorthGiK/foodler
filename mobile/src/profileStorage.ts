import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, defaultProfile } from './types';

const PROFILE_KEY = '@food_tracker_profile';

export async function loadProfile(): Promise<UserProfile> {
    try {
        const json = await AsyncStorage.getItem(PROFILE_KEY);
        if (json) {
            const parsed = JSON.parse(json);
            // Обеспечиваем наличие массива familyMembers
            return {
                ...defaultProfile,
                ...parsed,
                familyMembers: parsed.familyMembers ?? [],
            };
        }
    } catch (e) {
        console.warn('Failed to load profile', e);
    }
    return { ...defaultProfile };
}

export async function saveProfile(profile: UserProfile): Promise<void> {
    try {
        await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch (e) {
        console.warn('Failed to save profile', e);
    }
}