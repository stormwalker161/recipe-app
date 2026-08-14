import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AddRecipeScreen from './src/screens/AddRecipeScreen';
import EditRecipeScreen from './src/screens/EditRecipeScreen';
import HomeScreen from './src/screens/HomeScreen';
import RecipeDetailScreen from './src/screens/RecipeDetailScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'My Recipes' }} />
          <Stack.Screen
            name="RecipeDetail"
            component={RecipeDetailScreen}
            options={{ title: 'Recipe' }}
          />
          <Stack.Screen
            name="AddRecipe"
            component={AddRecipeScreen}
            options={{ title: 'Add Recipe', presentation: 'modal' }}
          />
          <Stack.Screen
            name="EditRecipe"
            component={EditRecipeScreen}
            options={{ title: 'Edit Recipe', presentation: 'modal' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
