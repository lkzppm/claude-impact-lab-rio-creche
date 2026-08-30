import { Routes, Route, Navigate } from "react-router-dom";
import { AppHeader } from "./design-system";
import { AreaProvider } from "./areas/AreaContext";
import LandingPage from "./pages/LandingPage";
import FamiliaPage from "./pages/FamiliaPage";
import FamiliaInscricaoPage from "./pages/FamiliaInscricaoPage";
import PainelPage from "./pages/PainelPage";
import ConvocacoesPage from "./pages/ConvocacoesPage";
import ConvocacaoDetalhePage from "./pages/ConvocacaoDetalhePage";
import ClassificacaoPage from "./pages/ClassificacaoPage";
import RodadaDetalhePage from "./pages/RodadaDetalhePage";
import InscricoesPage from "./pages/InscricoesPage";
import InscricaoDetalhePage from "./pages/InscricaoDetalhePage";
import UnidadesPage from "./pages/UnidadesPage";
import UnidadeDetalhePage from "./pages/UnidadeDetalhePage";
import SmeRedePage from "./pages/SmeRedePage";
import ReguaPage from "./pages/ReguaPage";
import NotFoundPage from "./pages/NotFoundPage";
import CrecheDashboardPage from "./pages/CrecheDashboardPage";
import CrecheVagasPage from "./pages/CrecheVagasPage";
import CrecheNovosAlunosPage from "./pages/CrecheNovosAlunosPage";
import CrecheDocumentosPage from "./pages/CrecheDocumentosPage";

export default function App() {
  return (
    <AreaProvider>
      <AppHeader />
      <Routes>
        <Route path="/" element={<LandingPage />} />

        {/* Família */}
        <Route path="/familia" element={<FamiliaPage />} />
        <Route path="/familia/inscricao" element={<FamiliaInscricaoPage />} />

        {/* CRE / polo */}
        <Route path="/cre" element={<PainelPage />} />
        <Route path="/cre/convocacoes" element={<ConvocacoesPage />} />
        <Route path="/cre/convocacoes/:id" element={<ConvocacaoDetalhePage />} />
        <Route path="/cre/unidades" element={<UnidadesPage />} />
        <Route path="/cre/unidades/:codigo" element={<UnidadeDetalhePage />} />
        <Route path="/cre/inscricoes/:id" element={<InscricaoDetalhePage />} />

        {/* Nível Central SME */}
        <Route path="/sme" element={<SmeRedePage />} />
        <Route path="/sme/classificacao" element={<ClassificacaoPage />} />
        <Route path="/sme/classificacao/:id" element={<RodadaDetalhePage />} />
        <Route path="/sme/inscricoes" element={<InscricoesPage />} />
        <Route path="/sme/inscricoes/:id" element={<InscricaoDetalhePage />} />
        <Route path="/sme/unidades" element={<UnidadesPage />} />
        <Route path="/sme/unidades/:codigo" element={<UnidadeDetalhePage />} />
        <Route path="/sme/regua" element={<ReguaPage />} />

        {/* Creche / EDI */}
        <Route path="/creche" element={<CrecheDashboardPage />} />
        <Route path="/creche/vagas" element={<CrecheVagasPage />} />
        <Route path="/creche/novos-alunos" element={<CrecheNovosAlunosPage />} />
        <Route path="/creche/documentos" element={<CrecheDocumentosPage />} />

        {/* endereços antigos */}
        <Route path="/convocacoes/*" element={<Navigate to="/cre/convocacoes" replace />} />
        <Route path="/classificacao/*" element={<Navigate to="/sme/classificacao" replace />} />
        <Route path="/inscricoes/*" element={<Navigate to="/sme/inscricoes" replace />} />
        <Route path="/unidades/*" element={<Navigate to="/sme/unidades" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AreaProvider>
  );
}
