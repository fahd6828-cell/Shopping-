import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import { SearchResultsScreen } from "./src/screens/SearchResultsScreen";
import { TrackedProductsScreen } from "./src/screens/TrackedProductsScreen";
import { ProductDetailsScreen } from "./src/screens/ProductDetailsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import type { TrackedItemDto } from "./src/api/client";
import { colors } from "./src/theme";

/**
 * سوقلي — app shell.
 *
 * RTL note: index.js calls I18nManager.forceRTL(true) before registering
 * this component; react-navigation then mirrors tab order, headers, and
 * back gestures automatically.
 */

export type TrackedStackParamList = {
  TrackedList: undefined;
  ProductDetails: { item: TrackedItemDto };
};

const Tab = createBottomTabNavigator();
const TrackedStack = createNativeStackNavigator<TrackedStackParamList>();

function TrackedStackScreen() {
  return (
    <TrackedStack.Navigator
      screenOptions={{
        headerTitleStyle: { fontWeight: "700" },
        headerTintColor: colors.greenDark,
      }}
    >
      <TrackedStack.Screen name="TrackedList" options={{ title: "المتتبَّعة" }}>
        {({ navigation }) => (
          <TrackedProductsScreen
            onOpenListing={(item) =>
              navigation.navigate("ProductDetails", { item })
            }
          />
        )}
      </TrackedStack.Screen>
      <TrackedStack.Screen
        name="ProductDetails"
        options={{ title: "تفاصيل المنتج" }}
      >
        {({ route }) => <ProductDetailsScreen item={route.params.item} />}
      </TrackedStack.Screen>
    </TrackedStack.Navigator>
  );
}

const TABS = [
  { name: "Search", title: "بحث", icon: "🔍", component: SearchResultsScreen },
  { name: "Tracked", title: "المتتبَّعة", icon: "🔔", component: TrackedStackScreen },
  { name: "Settings", title: "الإعدادات", icon: "⚙️", component: SettingsScreen },
] as const;

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: colors.greenDark,
          tabBarInactiveTintColor: colors.inkSoft,
          tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
          headerTitleStyle: { fontWeight: "800" },
          headerTintColor: colors.greenDark,
        }}
      >
        {TABS.map(({ name, title, icon, component }) => (
          <Tab.Screen
            key={name}
            name={name}
            component={component}
            options={{
              title,
              headerShown: name !== "Tracked", // stack owns its header
              tabBarIcon: ({ focused }) => (
                <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.55 }}>
                  {icon}
                </Text>
              ),
            }}
          />
        ))}
      </Tab.Navigator>
    </NavigationContainer>
  );
}
