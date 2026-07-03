/**
 * سوقلي — entry point.
 *
 * RTL must be forced before the root component registers. The very first
 * launch after install flips the layout direction and requires an app
 * reload to take effect (use react-native-restart in the onboarding flow).
 */
import { AppRegistry, I18nManager } from "react-native";
import App from "./App";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

AppRegistry.registerComponent("SouqlyApp", () => App);
