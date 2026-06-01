import { Navigate } from "react-router-dom";
import { getToken } from "../api/client.js";

export default function Landing() {
  return <Navigate to={getToken() ? "/dashboard" : "/login"} replace />;
}
