// Phase 4.2 / 4.3 tests: project case-study knowledge, role-fit retrieval and prompt rules.
// Mocked and offline: no network, no Workers AI calls, no neurons.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CANDIDATE_PROFILE, KNOWLEDGE_SECTIONS, retrieveSections, buildGroundedPrompt } from '../src/knowledge.js';

const ids = (sections) => sections.map((s) => s.id);
const portfolioHtml = readFileSync(new URL('../../portfolio/index.html', import.meta.url), 'utf8');
// The portfolio uses HTML entities; compare against its plain text.
const portfolioText = portfolioHtml
  .replace(/&amp;/g, '&').replace(/&rarr;/g, '→').replace(/&times;/g, '×').replace(/&sup2;/g, '²')
  .replace(/&rsquo;/g, '’').replace(/&ldquo;|&rdquo;/g, '"').replace(/\s+/g, ' ');

describe('Phase 4: project case studies', () => {
  test('every portfolio project has case-study facts in the knowledge base', () => {
    for (const p of CANDIDATE_PROFILE.projects.slice(0, 3)) {
      assert.ok(p.caseStudy, `${p.portfolioTitle}: caseStudy missing`);
      for (const field of ['objective', 'dataSource', 'preparation', 'method']) {
        assert.equal(typeof p.caseStudy[field], 'string', `${p.portfolioTitle}: ${field}`);
        assert.ok(p.caseStudy[field].length > 30, `${p.portfolioTitle}: ${field} too short`);
      }
    }
    for (const field of ['questions', 'dataSource', 'preparation', 'disclaimer']) {
      assert.equal(typeof CANDIDATE_PROFILE.research[field], 'string', `research.${field}`);
    }
  });

  test('the portfolio shows a case study for each of the four projects', () => {
    assert.equal((portfolioHtml.match(/<details class="case-study">/g) || []).length, 4);
  });

  // Distinctive facts that must agree between Ask GORA and the portfolio page (drift guard).
  const sharedFacts = {
    'project-1': ['PromptCloud', '154 duplicate responses', 'SHA-256', 'self-select'],
    'project-2': ['1990 census', 'ColumnTransformer', 'permutation feature importance'],
    'project-3': ['28×28 grayscale', 'centre of mass', '15 epochs, batch size 64'],
    research: ['CC BY 4.0', 'Cleveland (303 records)', 'Serum cholesterol is excluded', 'not a clinical diagnostic tool']
  };
  for (const [sectionId, facts] of Object.entries(sharedFacts)) {
    test(`${sectionId}: case-study facts match between Ask GORA and the portfolio`, () => {
      const section = KNOWLEDGE_SECTIONS.find((s) => s.id === sectionId);
      assert.ok(section, `section ${sectionId} exists`);
      for (const fact of facts) {
        assert.ok(section.text.includes(fact), `${sectionId}: knowledge base lacks "${fact}"`);
        assert.ok(portfolioText.includes(fact), `${sectionId}: portfolio page lacks "${fact}"`);
      }
    });
  }

  test('project questions retrieve that project with its case study', () => {
    const sections = retrieveSections('Walk me through the house price project');
    assert.ok(ids(sections).includes('project-2'));
    assert.ok(sections.find((s) => s.id === 'project-2').text.includes('Objective:'));
  });

  test('a question naming a section topic prefers that section (research data question)', () => {
    assert.ok(ids(retrieveSections('What data did his research use?')).includes('research'));
  });

  test('limitations are documented only where the repository documents them', () => {
    const withLimits = CANDIDATE_PROFILE.projects.filter((p) => p.caseStudy && p.caseStudy.limitations);
    assert.deepEqual(withLimits.map((p) => p.portfolioTitle), ['IBM Data Analyst Capstone: Tech Trends & Skills Analysis']);
  });
});

describe('Phase 4: recruiter-oriented answers', () => {
  test('role-fit questions retrieve the evidence sections', () => {
    const got = ids(retrieveSections('Is he a good fit for a Data Analyst role?'));
    for (const id of ['skills', 'experience', 'projects-overview', 'certifications', 'career']) assert.ok(got.includes(id), id);
  });

  test('the prompt includes the project-explanation and role-fit rules with the résumé link', () => {
    const prompt = buildGroundedPrompt('Is he a good fit for a Data Analyst role?');
    assert.ok(prompt.includes('9. Project questions'));
    assert.ok(prompt.includes('10. Role-fit questions'));
    assert.ok(prompt.includes(CANDIDATE_PROFILE.links.resume));
    assert.ok(prompt.includes('without promising suitability'));
  });

  test('grounded prompts stay bounded (cost guard)', () => {
    const questions = ['hi', 'Is he a good fit for a Data Analyst role?', 'Walk me through the house price project',
      'What data did his research use?', 'Tell me about the IBM data analyst capstone project.', 'What projects has he built?'];
    for (const q of questions) {
      const n = buildGroundedPrompt(q).length;
      assert.ok(n <= 9000, `${q}: ${n} characters`);
    }
  });
});
