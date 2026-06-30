import { createBrowserRouter } from "react-router";
import Root from "./components/Root";
import HomePage from "./pages/HomePage";
import SignLanguagePage from "./pages/SignLanguagePage";
import SignLanguageHistoryPage from "./pages/SignLanguageHistoryPage";
import SignLanguageSessionDetailPage from "./pages/SignLanguageSessionDetailPage";
import SoundDetectionPage from "./pages/SoundDetectionPage";
import CommunityPage from "./pages/CommunityPage";
import PostDetailPage from "./pages/PostDetailPage";
import ProfilePage from "./pages/ProfilePage";
import FollowListPage from "./pages/FollowListPage";
import MyPostsPage from "./pages/MyPostsPage";
import MyCommentsPage from "./pages/MyCommentsPage";
import LoginPage from "./pages/LoginPage";
import EditProfilePage from "./pages/EditProfilePage";
import HelpCenterPage from "./pages/HelpCenterPage";
import PrivacySettingsPage from "./pages/PrivacySettingsPage";
import UserAgreementPage from "./pages/UserAgreementPage";
import PointsPage from "./pages/PointsPage";
import AchievementsPage from "./pages/AchievementsPage";
import UsageStatsPage from "./pages/UsageStatsPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: HomePage },
      { path: "home", Component: HomePage },
      { path: "sign-language/history", Component: SignLanguageHistoryPage },
      { path: "sign-language/history/:sessionId", Component: SignLanguageSessionDetailPage },
      { path: "sign-language", Component: SignLanguagePage },
      { path: "sound", Component: SoundDetectionPage },
      { path: "community", Component: CommunityPage },
      { path: "community/post/:postId", Component: PostDetailPage },
      { path: "profile", Component: ProfilePage },
      { path: "profile/follow", Component: FollowListPage },
      { path: "profile/posts", Component: MyPostsPage },
      { path: "profile/comments", Component: MyCommentsPage },
      { path: "profile/edit", Component: EditProfilePage },
      { path: "help", Component: HelpCenterPage },
      { path: "privacy", Component: PrivacySettingsPage },
      { path: "agreement", Component: UserAgreementPage },
      { path: "points", Component: PointsPage },
      { path: "achievements", Component: AchievementsPage },
      { path: "usage", Component: UsageStatsPage },
      { path: "change-password", Component: ChangePasswordPage },
    ],
  },
  { path: "/login", Component: LoginPage },
  // 独立页面：不受 Root 认证保护，处理邮件重置链接的 hash token
  { path: "/reset-password", Component: ResetPasswordPage },
]);
