import { act, create } from "react-test-renderer";
import { Text, TextInput } from "react-native";

import { defaultProfile, UserProfile } from "../../../types";
import { ProfileInfoCard } from "../ProfileInfoCard";

jest.mock("@react-native-vector-icons/material-icons", () => () => null);
jest.mock("@/components/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      border: "#ccc",
      muted: "#777",
      onPrimaryContainer: "#531",
      outline: "#ddd",
      primary: "#06f",
      primaryContainer: "#eef",
      surface: "#fff",
      surfaceElevated: "#f7f7f7",
      text: "#111",
    },
  }),
}));

const profile: UserProfile = {
  ...defaultProfile,
  name: "Анна",
  additionalInfo: "Без орехов",
  likedFoods: ["Овощи"],
  dislikedFoods: ["Печень"],
  nutritionGoal: "healthy",
  activityLevel: "medium",
};

describe("ProfileInfoCard", () => {
  it("renders profile values and keeps the optional details visible", async () => {
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(
        <ProfileInfoCard
          profile={profile}
          editing={false}
          onEdit={jest.fn()}
          onCancel={jest.fn()}
          onSave={jest.fn()}
          onProfileChange={jest.fn()}
        />,
      );
    });

    const texts = view!.root
      .findAllByType(Text)
      .map((node) => node.props.children);
    expect(texts).toEqual(
      expect.arrayContaining([
        "Анна",
        "Без орехов",
        "Овощи",
        "Печень",
        "Питаться полезнее",
        "Средняя",
      ]),
    );
    expect(texts).toContain("30");
    expect(
      view!.root.findByProps({
        accessibilityLabel: "Изменить личную информацию",
      }),
    ).toBeTruthy();
  });

  it("updates editable fields and toggles gender", async () => {
    const onProfileChange = jest.fn();
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(
        <ProfileInfoCard
          profile={profile}
          editing
          onEdit={jest.fn()}
          onCancel={jest.fn()}
          onSave={jest.fn()}
          onProfileChange={onProfileChange}
        />,
      );
    });

    await act(async () => {
      view!.root.findAllByType(TextInput)[0].props.onChangeText("Мария");
    });
    expect(onProfileChange).toHaveBeenCalledWith({ ...profile, name: "Мария" });

    await act(async () => {
      view!.root
        .findByProps({ accessibilityLabel: "Изменить пол" })
        .props.onPress();
    });
    expect(onProfileChange).toHaveBeenLastCalledWith({
      ...profile,
      gender: "female",
    });
  });

  it("exposes cancel and save actions in edit mode", async () => {
    const onCancel = jest.fn();
    const onSave = jest.fn();
    let view: ReturnType<typeof create>;
    await act(async () => {
      view = create(
        <ProfileInfoCard
          profile={profile}
          editing
          onEdit={jest.fn()}
          onCancel={onCancel}
          onSave={onSave}
          onProfileChange={jest.fn()}
        />,
      );
    });

    await act(async () => {
      view!.root
        .findByProps({
          accessibilityLabel: "Отменить редактирование личной информации",
        })
        .props.onPress();
      view!.root
        .findByProps({ accessibilityLabel: "Сохранить личную информацию" })
        .props.onPress();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(view!.root.findAllByType(TextInput)).toHaveLength(7);
  });
});
