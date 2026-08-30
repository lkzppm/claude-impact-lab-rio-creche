import { Routes, Route } from "react-router-dom";
import { AppHeader } from "./design-system";
import PainelPage from "./pages/PainelPage";
import ConvocacoesPage from "./pages/ConvocacoesPage";
import ConvocacaoDetalhePage from "./pages/ConvocacaoDetalhePage";
import ClassificacaoPage from "./pages/ClassificacaoPage";
import RodadaDetalhePage from "./pages/RodadaDetalhePage";
import InscricoesPage from "./pages/InscricoesPage";
import InscricaoDetalhePage from "./pages/InscricaoDetalhePage";
import UnidadesPage from "./pages/UnidadesPage";
import UnidadeDetalhePage from "./pages/UnidadeDetalhePage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <>
      <AppHeader />
      <Routes>
        <Route path="/" element={<PainelPage />} />
        <Route path="/convocacoes" element={<ConvocacoesPage />} />
        <Route path="/convocacoes/:id" element={<ConvocacaoDetalhePage />} />
        <Route path="/classificacao" element={<ClassificacaoPage />} />
        <Route path="/classificacao/:id" element={<RodadaDetalhePage />} />
        <Route path="/inscricoes" element={<InscricoesPage />} />
        <Route path="/inscricoes/:id" element={<InscricaoDetalhePage />} />
        <Route path="/unidades" element={<UnidadesPage />} />
        <Route path="/unidades/:codigo" element={<UnidadeDetalhePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
