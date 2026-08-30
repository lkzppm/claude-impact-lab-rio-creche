# 03 — Dados disponibilizados

A SME-Rio disponibiliza dados **anonimizados reais** dos processos de Inscrição Creche de **2021 a 2025**.
Crianças e responsáveis são identificados apenas por códigos anônimos (`aluno_NNNNNNN` / `responsavel_NNNNNNN`);
nome e endereço completo do responsável não são expostos — apenas **bairro e CEP**.

## Tabelas principais

| Tabela | Descrição | Campos | Quant. | Utilidade |
|---|---|---|---|---|
| **Inscrições por opção** (Query A) | Cada opção de creche escolhida dentro de uma inscrição | Ano/processo/polo/inscrição, opção (1 a 5), unidade, grupamento, turno, data de criação, código anônimo da criança e do responsável, CEP/bairro, situação | **837.179** | Calcular tempo de espera, taxa de conversão por unidade, mapear demanda × oferta |
| **Respostas socioeconômicas** (Query B) | Respostas ao questionário de vulnerabilidade | Pergunta respondida, resposta (Sim/Não), se foi confirmada | — | Reconstituir o perfil de vulnerabilidade de cada inscrição |
| **Perguntas por processo** (Query C) | Catálogo de critérios e pontuação vigente em cada processo seletivo | Texto da pergunta, pontuação, critério, ordem de exibição, por ano | **65** | Aplicar corretamente a régua vigente em cada ano — **os pesos mudam** |
| **Unidades escolares** | Cadastro de creches e EDIs | Código, nome, tipo de gestão (direta/conveniada/parceria), endereço, bairro, CEP | **2.188** | Mapear a oferta geográfica e cruzar com bairro/CEP do responsável |

## Tabelas complementares

| Tabela | Descrição | Fonte |
|---|---|---|
| `Parceiras21…25` | Consolidado de total de alunos ativos das unidades parceiras por grupamento | Planilhas consolidadas em Excel |
| `Totalalunoscreche21…25` | Total de alunos por escola e grupamento nos respectivos anos | Sistema de gestão acadêmica |
| `Unidade_Unificadas_com_localizacao` | Unidades da rede com microárea, endereço, lat/long | Arquivo próprio |
| `Microareas_SME_IPP` | Organização territorial da SME | Instituto Pereira Passos (IPP) |

## O que é registrado em cada opção de inscrição

- Opção escolhida (**1ª a 5ª**) e unidade escolar correspondente
- **Grupamento etário:** Berçário, Maternal I ou Maternal II
- **Situação da opção:** `Ativo`, `Selecionado`, `Selecionado da lista`, `Confirmado`, `Lista de espera`,
  `Cancelado`, `Cancelado na confirmação`, `Cancelado pelo sistema`
- Respostas ao questionário socioeconômico (Sim/Não) e **se cada resposta foi confirmada**
- Data de criação da inscrição, e CEP/bairro do responsável quando informados

## Anonimização — limites a respeitar na análise

| ❌ O que **NÃO** representa a realidade | ✅ O que **está preservado** |
|---|---|
| Identidade real de crianças e responsáveis | A relação inscrição → opção |
| Endereço exato (apenas bairro/CEP) | A lógica de pontuação vigente em cada processo |
| Data de nascimento exata da criança (só ano-mês) | As relações entre as quatro tabelas |
| Contagem exata de crianças quando falta CPF/DNV/NIS | A dinâmica real de transição de status |

> **Consequência prática:** qualquer métrica "por criança" tem erro conhecido quando falta CPF/DNV/NIS
> (ver gap de colisão de identificação em [02](02-case-oficial.md)). Métricas "por inscrição" e
> "por opção" são confiáveis. Georreferenciamento fino só é possível via microárea/CEP, não por endereço.
