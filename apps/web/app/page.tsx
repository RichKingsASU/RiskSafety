'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  buildMockCarriers, 
  buildOwnFleet, 
  INITIAL_AUDIT_LOGS, 
  INITIAL_LOADS, 
  type CarrierMockRecord, 
  type AuditLog, 
  type TMSLoad,
  type FleetAsset,
  type DriverMock,
  type EquipmentMock,
  type CoiOcrMock,
  type ClaimMock,
  type FmcsaLogMock,
  type DocumentMock
} from './mockData';
import { computeScore } from '@forrest/scoring';
import { 
  INSURANCE_MINIMUMS, 
  SCORE_WEIGHTS, 
  QUALITY_BAND_CUTOFFS, 
  DISPATCH_DEFAULTS, 
  CARRIER_POPULATION, 
  OWN_FLEET_POWER_UNITS,
  type AuthorityStatus,
  type SafetyRating,
  type QualityBand,
  type DispatchBand
} from '@forrest/shared/constants';

export default function RSOSDashboard() {
  // App Core State
  const [carriers, setCarriers] = useState<CarrierMockRecord[]>([]);
  const [ownFleet, setOwnFleet] = useState<FleetAsset[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loads, setLoads] = useState<TMSLoad[]>([]);
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>('c1000000-0000-0000-0000-000000000001');
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [profileSubTab, setProfileSubTab] = useState<string>('overview'); // overview | drivers | equipment | insurance | claims | fmcsa | documents
  const [persona, setPersona] = useState<'danica' | 'elizabeth'>('danica');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterQuality, setFilterQuality] = useState<string>('all');
  const [filterDispatch, setFilterDispatch] = useState<string>('all');
  const [filterFlags, setFilterFlags] = useState<string>('all');
  const [sortField, setSortField] = useState<'score' | 'name' | 'dot'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  // Danica (Triage) Queue States
  const [triageQueueTab, setTriageQueueTab] = useState<'onboarding' | 'remediation'>('onboarding');
  const [activeRemediationDossierId, setActiveRemediationDossierId] = useState<string | null>(null);
  
  // Interactive Checklist states for C3 Harbor Point Drayage (remediation demo)
  const [checkedRemediationItems, setCheckedRemediationItems] = useState({
    explainOos: false,
    repairInvoice: false,
    driverCdl: false,
    checklistAdded: false,
  });

  // Action Modals State
  const [showClearanceModal, setShowClearanceModal] = useState<boolean>(false);
  const [showDnuModal, setShowDnuModal] = useState<boolean>(false);
  const [clearanceCarrierId, setClearanceCarrierId] = useState<string | null>(null);
  const [dnuCarrierId, setDnuCarrierId] = useState<string | null>(null);
  const [dialogReason, setDialogReason] = useState<string>('');

  // Interactive COI review states
  const [coiReason, setCoiReason] = useState<string>('');
  const [showDocPreview, setShowDocPreview] = useState<boolean>(false);
  const [previewDocName, setPreviewDocName] = useState<string>('');

  // Initial Load
  useEffect(() => {
    setCarriers(buildMockCarriers());
    setOwnFleet(buildOwnFleet());
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setLoads(INITIAL_LOADS);
  }, []);

  // Find currently selected carrier record
  const selectedCarrier = useMemo(() => {
    const found = carriers.find(c => c.id === selectedCarrierId) || carriers[0];
    if (found) return found;
    
    // Fallback carrier structure for initial render so it is never undefined
    return {
      is_named: false,
      fixture_key: null,
      id: '',
      dot_number: '',
      mc_number: '',
      legal_name: '',
      dba_name: '',
      authority_status: 'active' as AuthorityStatus,
      authority_grant_date: '',
      safety_rating: 'satisfactory' as SafetyRating,
      power_unit_count: 0,
      physical_address: '',
      phone: '',
      ab5_status: 'na' as const,
      identity_verified: true,
      carrierassure_grade: null,
      divergence_flag: false,
      inputs: { fleet_size_score: 0, vehicle_oos_score: 0, driver_oos_score: 0, accident_rate_score: 0, confidence_modifier: 1 },
      gates: {
        authority_status: 'active' as AuthorityStatus,
        safety_rating: 'satisfactory' as SafetyRating,
        insurance_lapsed_or_below_min: false,
        on_dnu: false,
        confirmed_fraud: false,
        has_open_material_flag: false,
        is_thin_file: false,
      },
      scoreResult: {
        overall: 0,
        raw: 0,
        contributions: { fleet_size: 0, vehicle_oos: 0, driver_oos: 0, accident_rate: 0 },
        confidence_modifier: 1,
        overall_score: 0,
        quality_band: 'excellent' as QualityBand,
        dispatch_band: 'green' as DispatchBand,
        hard_gate_triggered: false,
        routed_to_review: false,
      },
      insurance: { auto_liability: 0, cargo: 0, trailer_interchange: 0, workers_comp: false },
      driversRoster: [] as DriverMock[],
      equipmentRoster: [] as EquipmentMock[],
      coiOcr: {
        insurer_name: '',
        auto_limit: 0,
        cargo_limit: 0,
        trailer_interchange_limit: 0,
        workers_comp_status: false,
        expiration_date: '',
        review_status: 'pending' as const,
      },
      claimsRoster: [] as ClaimMock[],
      fmcsaLogs: [] as FmcsaLogMock[],
      documentsRoster: [] as DocumentMock[],
    };
  }, [carriers, selectedCarrierId]);

  // Collapsible Navigation Items (14 items as specified in AGENTS.md Navigation)
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'carriers', label: 'Carriers', icon: '🚚' },
    { id: 'pre_screen', label: 'Pre-Screen', icon: '📋' },
    { id: 'drivers', label: 'Drivers', icon: '🪪' },
    { id: 'equipment', label: 'Equipment', icon: '⚙️' },
    { id: 'insurance', label: 'Insurance', icon: '🛡️' },
    { id: 'fmcsa', label: 'FMCSA Monitoring', icon: '📡' },
    { id: 'claims', label: 'Claims', icon: '💥' },
    { id: 'tasks', label: 'Compliance Tasks', icon: '✅' },
    { id: 'risk_review', label: 'Risk Review', icon: '⚖️' }, // Fraud & Capacity live inside Risk Review
    { id: 'documents', label: 'Documents', icon: '📂' },
    { id: 'own_fleet', label: 'Own-Fleet Safety', icon: '🔋' }, // Separate Samsara view
    { id: 'reports', label: 'Reports', icon: '📈' },
    { id: 'admin', label: 'Admin', icon: '🛠️' },
  ];

  // Route logic for main sidebar click
  const handleNavClick = (tabId: string) => {
    if (['drivers', 'equipment', 'insurance', 'fmcsa', 'claims', 'documents'].includes(tabId)) {
      setActiveTab('carriers_detail');
      setProfileSubTab(tabId);
    } else {
      setActiveTab(tabId);
      setProfileSubTab('overview');
    }
  };

  // Map state logic to display helper properties
  const scoreStats = useMemo(() => {
    if (carriers.length === 0) return { excellent: 0, good: 0, fair: 0, poor: 0 };
    const stats = { excellent: 0, good: 0, fair: 0, poor: 0 };
    carriers.forEach(c => {
      const q = c.scoreResult.quality_band;
      if (q === 'excellent') stats.excellent++;
      else if (q === 'good') stats.good++;
      else if (q === 'fair') stats.fair++;
      else stats.poor++;
    });
    return stats;
  }, [carriers]);

  const dispatchStats = useMemo(() => {
    if (carriers.length === 0) return { green: 0, yellow: 0, orange: 0, red: 0 };
    const stats = { green: 0, yellow: 0, orange: 0, red: 0 };
    carriers.forEach(c => {
      const d = c.scoreResult.dispatch_band;
      if (d === 'green') stats.green++;
      else if (d === 'yellow') stats.yellow++;
      else if (d === 'orange') stats.orange++;
      else stats.red++;
    });
    return stats;
  }, [carriers]);

  // Filters & Sorters logic
  const sortedAndFilteredCarriers = useMemo(() => {
    let result = [...carriers];

    // Search filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        c => c.legal_name.toLowerCase().includes(q) || 
             c.dot_number.includes(q) || 
             c.mc_number.toLowerCase().includes(q)
      );
    }

    // Quality filter
    if (filterQuality !== 'all') {
      result = result.filter(c => c.scoreResult.quality_band === filterQuality);
    }

    // Dispatch status filter
    if (filterDispatch !== 'all') {
      result = result.filter(c => c.scoreResult.dispatch_band === filterDispatch);
    }

    // Gate flags filter
    if (filterFlags !== 'all') {
      if (filterFlags === 'has_flags') {
        result = result.filter(c => c.scoreResult.hard_gate_triggered || c.scoreResult.routed_to_review);
      } else {
        result = result.filter(c => !c.scoreResult.hard_gate_triggered && !c.scoreResult.routed_to_review);
      }
    }

    // Sorting (HIGH = GOOD is default, meaning excellent carriers first when sort Field = score & order = desc)
    result.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortField === 'score') {
        valA = a.scoreResult.overall_score;
        valB = b.scoreResult.overall_score;
      } else if (sortField === 'name') {
        valA = a.legal_name.toLowerCase();
        valB = b.legal_name.toLowerCase();
      } else {
        valA = a.dot_number;
        valB = b.dot_number;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [carriers, searchQuery, filterQuality, filterDispatch, filterFlags, sortField, sortOrder]);

  // Paginated list
  const paginatedCarriers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedAndFilteredCarriers.slice(start, start + pageSize);
  }, [sortedAndFilteredCarriers, currentPage]);

  const totalPages = Math.ceil(sortedAndFilteredCarriers.length / pageSize) || 1;

  // Onboarding Queue (Green/Clean carriers pending review/onboarding status)
  const onboardingQueue = useMemo(() => {
    return carriers.filter(c => c.scoreResult.dispatch_band === 'green' && c.ab5_status !== 'na');
  }, [carriers]);

  // Remediation Queue (Yellow/Needs Review carriers requiring audit dossiers)
  const remediationQueue = useMemo(() => {
    return carriers.filter(c => c.scoreResult.dispatch_band === 'yellow');
  }, [carriers]);

  // Fraud / Capacity Anomaly Carriers (Elizabeth Persona)
  const anomalyCarriers = useMemo(() => {
    return carriers.filter(c => c.divergence_flag || c.gates.confirmed_fraud || c.gates.authority_status === 'revoked');
  }, [carriers]);

  // Action: Clear Onboarding
  const handleClearOnboarding = (carrierId: string) => {
    setClearanceCarrierId(carrierId);
    setDialogReason('');
    setShowClearanceModal(true);
  };

  const submitClearance = () => {
    if (!clearanceCarrierId || !dialogReason.trim()) return;

    setCarriers(prev => prev.map(c => {
      if (c.id === clearanceCarrierId) {
        // Clear flags/gates and advance
        return {
          ...c,
          ab5_status: 'na', // advanced
          scoreResult: {
            ...c.scoreResult,
            routed_to_review: false,
          }
        };
      }
      return c;
    }));

    const carrier = carriers.find(c => c.id === clearanceCarrierId);
    
    // Add to audit trail
    const newLog: AuditLog = {
      id: `a-${Date.now()}`,
      carrier_id: clearanceCarrierId,
      carrier_name: carrier?.legal_name || 'Unknown Carrier',
      action_type: 'onboarding_clearance',
      performed_by: persona === 'danica' ? 'Danica (Triage)' : 'Elizabeth (Deep-Dive)',
      performed_at: new Date().toISOString(),
      details: 'Cleared onboarding review. Marked as active and cleared for dispatch.',
      reason: dialogReason,
    };

    setAuditLogs(prev => [newLog, ...prev]);
    setShowClearanceModal(false);
    setClearanceCarrierId(null);
    setDialogReason('');
  };

  // Action: Add to DNU / Block Carrier
  const handleDnuBlock = (carrierId: string) => {
    setDnuCarrierId(carrierId);
    setDialogReason('');
    setShowDnuModal(true);
  };

  const submitDnuBlock = () => {
    if (!dnuCarrierId || !dialogReason.trim()) return;

    setCarriers(prev => prev.map(c => {
      if (c.id === dnuCarrierId) {
        const updatedGates = {
          ...c.gates,
          on_dnu: true,
          authority_status: 'revoked' as AuthorityStatus,
        };
        const updatedResult = computeScore(c.inputs, updatedGates);
        return {
          ...c,
          authority_status: 'revoked' as AuthorityStatus,
          gates: updatedGates,
          scoreResult: updatedResult,
        };
      }
      return c;
    }));

    const carrier = carriers.find(c => c.id === dnuCarrierId);

    // Add to audit trail
    const newLog: AuditLog = {
      id: `a-${Date.now()}`,
      carrier_id: dnuCarrierId,
      carrier_name: carrier?.legal_name || 'Unknown Carrier',
      action_type: 'dnu_update',
      performed_by: persona === 'danica' ? 'Danica (Triage)' : 'Elizabeth (Deep-Dive)',
      performed_at: new Date().toISOString(),
      details: 'Enforced Block/DNU list placement. Dispatch status forced to RED.',
      reason: dialogReason,
    };

    setAuditLogs(prev => [newLog, ...prev]);
    setShowDnuModal(false);
    setDnuCarrierId(null);
    setDialogReason('');
  };

  // Action: Submit Remediation Dossier for Harbor Point Drayage (C3)
  const submitRemediationDossier = (carrierId: string) => {
    setCarriers(prev => prev.map(c => {
      if (c.id === carrierId) {
        // Advance status from Yellow to Green
        const updatedGates = {
          ...c.gates,
          is_thin_file: false,
          safety_rating: 'satisfactory' as SafetyRating
        };
        const updatedResult = computeScore(c.inputs, updatedGates);
        return {
          ...c,
          gates: updatedGates,
          scoreResult: updatedResult
        };
      }
      return c;
    }));

    const newLog: AuditLog = {
      id: `a-${Date.now()}`,
      carrier_id: carrierId,
      carrier_name: 'Harbor Point Drayage',
      action_type: 'remediation_dossier',
      performed_by: 'Danica (Triage)',
      performed_at: new Date().toISOString(),
      details: 'Remediation Dossier submitted & approved. Thin-file flag cleared, promoted to green dispatch band.',
      reason: 'CDL scan verified. Repair invoice obtained and approved. Scheduled quarterly safety check.'
    };

    setAuditLogs(prev => [newLog, ...prev]);
    setActiveRemediationDossierId(null);
    alert('Dossier approved. Harbor Point Drayage has been cleared for dispatch.');
  };

  // Action: Approve parsed COI limits (B7 - human-gated)
  const handleCoiApprove = (carrierId: string) => {
    if (!coiReason.trim()) {
      alert('Please provide a vetting rationale/reason for audit log.');
      return;
    }
    
    setCarriers(prev => prev.map(c => {
      if (c.id === carrierId) {
        const updatedGates = {
          ...c.gates,
          insurance_lapsed_or_below_min: false
        };
        const updatedResult = computeScore(c.inputs, updatedGates);
        
        return {
          ...c,
          gates: updatedGates,
          scoreResult: updatedResult,
          coiOcr: {
            ...c.coiOcr,
            review_status: 'approved' as const,
            reviewed_by: persona === 'danica' ? 'Danica (Triage)' : 'Sam Ortiz (Safety Mgr)',
            reviewed_at: new Date().toISOString(),
            rejection_reason: undefined,
          }
        };
      }
      return c;
    }));

    const carrier = carriers.find(c => c.id === carrierId);

    const newLog: AuditLog = {
      id: `a-${Date.now()}`,
      carrier_id: carrierId,
      carrier_name: carrier?.legal_name || 'Unknown Carrier',
      action_type: 'coi_ocr_review',
      performed_by: persona === 'danica' ? 'Danica (Triage)' : 'Sam Ortiz (Safety Mgr)',
      performed_at: new Date().toISOString(),
      details: 'Certificate of Insurance (COI) approved manually. Insurance hard gate set to PASS.',
      reason: coiReason
    };

    setAuditLogs(prev => [newLog, ...prev]);
    setCoiReason('');
    alert('COI manually approved. Vetting gate updated.');
  };

  // Action: Reject parsed COI limits (B7 - human-gated)
  const handleCoiReject = (carrierId: string) => {
    if (!coiReason.trim()) {
      alert('Please specify the reason for COI rejection.');
      return;
    }

    setCarriers(prev => prev.map(c => {
      if (c.id === carrierId) {
        const updatedGates = {
          ...c.gates,
          insurance_lapsed_or_below_min: true
        };
        const updatedResult = computeScore(c.inputs, updatedGates);

        return {
          ...c,
          gates: updatedGates,
          scoreResult: updatedResult,
          coiOcr: {
            ...c.coiOcr,
            review_status: 'rejected' as const,
            reviewed_by: persona === 'danica' ? 'Danica (Triage)' : 'Sam Ortiz (Safety Mgr)',
            reviewed_at: new Date().toISOString(),
            rejection_reason: coiReason,
          }
        };
      }
      return c;
    }));

    const carrier = carriers.find(c => c.id === carrierId);

    const newLog: AuditLog = {
      id: `a-${Date.now()}`,
      carrier_id: carrierId,
      carrier_name: carrier?.legal_name || 'Unknown Carrier',
      action_type: 'coi_ocr_review',
      performed_by: persona === 'danica' ? 'Danica (Triage)' : 'Sam Ortiz (Safety Mgr)',
      performed_at: new Date().toISOString(),
      details: 'Certificate of Insurance (COI) rejected manually. Insurance hard gate set to FAIL.',
      reason: coiReason
    };

    setAuditLogs(prev => [newLog, ...prev]);
    setCoiReason('');
    alert('COI rejected. Carrier has been flagged and blocked from dispatch.');
  };

  // Action: Trigger mock document preview modal
  const handleDocPreview = (docName: string) => {
    setPreviewDocName(docName);
    setShowDocPreview(true);
  };

  // Toggle sorting
  const handleSort = (field: 'score' | 'name' | 'dot') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc'); // default sort high-to-low
    }
    setCurrentPage(1);
  };

  // Render Quality Tier Chip
  const renderQualityChip = (band: QualityBand) => {
    const labels = {
      excellent: 'Excellent',
      good: 'Good',
      fair: 'Fair',
      poor: 'Poor',
    };
    return (
      <span className={`quality-chip ${band}`}>
        {labels[band] || band}
      </span>
    );
  };

  // Render Dispatch Status Signal (PROVISIONAL)
  const renderDispatchSignal = (band: DispatchBand) => {
    const labels = {
      green: 'Approved',
      yellow: 'Needs Review',
      orange: 'Restricted',
      red: 'Blocked / DNU',
    };
    
    // Dispatch bands are provisional by default in RSOS until thresholds are ratified
    return (
      <div className={`dispatch-signal provisional-active ${band}`} title="Dispatch cutoff provisional">
        <span className="dispatch-dot" style={{ color: `var(--dispatch-${band}-text)` }} />
        <span style={{ marginRight: '0.4rem' }}>{labels[band]}</span>
        <span className="provisional-badge">PROV</span>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="logo-mark">F</div>
          <span className="brand-name">Forrest RSOS</span>
        </div>
        
        <nav className="sidebar-nav">
          {navItems.map(item => {
            const isActive = activeTab === item.id || 
              (['drivers', 'equipment', 'insurance', 'fmcsa', 'claims', 'documents'].includes(item.id) && activeTab === 'carriers_detail' && profileSubTab === item.id);
            return (
              <a 
                key={item.id} 
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavClick(item.id)}
              >
                <span className="nav-item-icon">{item.icon}</span>
                <span className="nav-item-label">{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className="sidebar-toggle">
          <button className="toggle-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            {sidebarCollapsed ? '➡️' : '⬅️'}
          </button>
        </div>
      </aside>

      {/* Main Body */}
      <div className="main-wrapper">
        
        {/* Top Header & Persona Switcher */}
        <header className="app-header">
          <div className="header-title-section">
            <h1 className="header-title">
              {activeTab === 'carriers_detail' 
                ? `Carrier Profile — ${profileSubTab.toUpperCase()}`
                : navItems.find(t => t.id === activeTab)?.label}
            </h1>
            {activeTab === 'dashboard' && (
              <span className="provisional-badge">
                ⚠️ SYSTEM IN PROVISIONAL RUN STATE (Q1/Q2 OFF)
              </span>
            )}
          </div>
          
          <div className="flex-between gap-05">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Reviewer Persona:</span>
            <div className="persona-switcher">
              <button 
                className={`persona-btn ${persona === 'danica' ? 'active' : ''}`}
                onClick={() => setPersona('danica')}
                title="Triage review optimization"
              >
                Danica (Triage)
              </button>
              <button 
                className={`persona-btn ${persona === 'elizabeth' ? 'active' : ''}`}
                onClick={() => setPersona('elizabeth')}
                title="Fraud / Forensic analysis"
              >
                Elizabeth (Deep-Dive)
              </button>
            </div>
          </div>
        </header>

        {/* Content Section */}
        <main className="page-content">

          {/* Persona quick alerts */}
          <div className="banner">
            <span className="banner-icon">💡</span>
            <div className="banner-content">
              {persona === 'danica' ? (
                <span>
                  Logged in as <strong>Danica (Triage)</strong>. Displaying green carrier onboarding and yellow remediation tasks. Focus on high throughput and clear queue actions.
                </span>
              ) : (
                <span>
                  Logged in as <strong>Elizabeth (Deep-Dive Analyst)</strong>. Displaying risk reviews, fraud indicators, address cross-references, and confirmation audit inputs.
                </span>
              )}
            </div>
          </div>

          {/* VIEW: Dashboard (Overview & Component Demo - B0 & B1) */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Statistics Panel */}
              <div className="dashboard-grid">
                <div className="dashboard-stat-card brand-accent">
                  <div className="stat-label">Carrier Population</div>
                  <div className="stat-value">{CARRIER_POPULATION}</div>
                  <div className="stat-trend">Canonical Vetted Directory</div>
                </div>
                <div className="dashboard-stat-card">
                  <div className="stat-label">Own Fleet (Samsara)</div>
                  <div className="stat-value">{OWN_FLEET_POWER_UNITS}</div>
                  <div className="stat-trend">Forrest Transport Units</div>
                </div>
                <div className="dashboard-stat-card">
                  <div className="stat-label">Blocked (DNU List)</div>
                  <div className="stat-value">{carriers.filter(c => c.gates.on_dnu).length}</div>
                  <div className="stat-trend">Enforced Hard Gates</div>
                </div>
                <div className="dashboard-stat-card">
                  <div className="stat-label">Pending Triage</div>
                  <div className="stat-value">{carriers.filter(c => c.scoreResult.dispatch_band === 'yellow').length}</div>
                  <div className="stat-trend">Danica's Queue</div>
                </div>
              </div>

              {/* B0: Shared Component Showcase */}
              <div className="showcase-section">
                <h2 className="section-title" style={{ borderLeftColor: '#818cf8', marginBottom: '0.5rem' }}>
                  B0: Component Library & States Showcase
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  Verify that Quality Bands (cutoffs fixed) and Dispatch Statuses (marked PROVISIONAL) are visually un-confusable and follow the correct scoring directionality (HIGH = GOOD).
                </p>
                
                <div className="showcase-grid">
                  {/* Gauge showcase */}
                  <div className="showcase-item">
                    <span className="showcase-label">Score Gauge (HIGH = GOOD)</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div className="score-gauge-container" style={{ width: '100%' }}>
                        <div className="score-gauge-ring-box">
                          <div className="score-gauge-ring" style={{ '--fill-percent': '86%', '--fill-color': 'var(--tier-excellent-bg)' } as any}>
                            <span className="score-gauge-ring-val">86</span>
                          </div>
                          <div className="score-gauge-info">
                            <span className="score-gauge-label">Excellent Carrier</span>
                            <span className="score-gauge-subtext">Accident Rate Weight: 40% (dominant)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quality tier chip showcase */}
                  <div className="showcase-item">
                    <span className="showcase-label">Quality-Tier Chips (Fixed Cutoffs)</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignSelf: 'flex-start', marginTop: '0.5rem' }}>
                      {renderQualityChip('excellent')}
                      {renderQualityChip('good')}
                      {renderQualityChip('fair')}
                      {renderQualityChip('poor')}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Excellent ≥80 · Good 60–79 · Fair 40–59 · Poor &lt;40
                    </span>
                  </div>

                  {/* Dispatch signals showcase */}
                  <div className="showcase-item">
                    <span className="showcase-label">Dispatch Status (Provisional Affordance)</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignSelf: 'flex-start' }}>
                      {renderDispatchSignal('green')}
                      {renderDispatchSignal('yellow')}
                      {renderDispatchSignal('orange')}
                      {renderDispatchSignal('red')}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Note: Hatched backgrounds and "PROV" label indicate unratified cutoffs.
                    </span>
                  </div>

                  {/* Gate flags showcase */}
                  <div className="showcase-item">
                    <span className="showcase-label">Gate-Flag Indicators</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div className="gate-flag">
                        <span className="gate-flag-icon">⛔</span>
                        <div className="gate-flag-body">
                          <span className="gate-flag-title">DNU / Blacklisted</span>
                          <span className="gate-flag-reason">Carrier added to internal blocked list.</span>
                        </div>
                      </div>
                      <div className="gate-flag">
                        <span className="gate-flag-icon">⚠️</span>
                        <div className="gate-flag-body">
                          <span className="gate-flag-title">Revoked Authority</span>
                          <span className="gate-flag-reason">Operating authority status in FMCSA is Revoked.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Guide to review B1 */}
              <div className="flex-between" style={{ marginTop: '3rem' }}>
                <h3 className="section-title">Quick Action Routes</h3>
                <button className="action-bar-btn" onClick={() => setActiveTab('carriers')}>
                  Go to Carrier Portfolio (B1) ➡️
                </button>
              </div>
            </div>
          )}

          {/* VIEW: B1 - Carrier Portfolio Overview */}
          {activeTab === 'carriers' && (
            <div>
              {/* Header stats distribution */}
              <div className="grid-cols-4">
                <div className="card">
                  <div className="card-title">Excellent Quality Tier</div>
                  <div className="card-value">{scoreStats.excellent}</div>
                  <div className="card-subtext">Composite score ≥ 80</div>
                </div>
                <div className="card">
                  <div className="card-title">Good Quality Tier</div>
                  <div className="card-value">{scoreStats.good}</div>
                  <div className="card-subtext">Composite score 60 - 79</div>
                </div>
                <div className="card">
                  <div className="card-title">Dispatch Green (Provisional)</div>
                  <div className="card-value">{dispatchStats.green}</div>
                  <div className="card-subtext">Provisional cutoffs active</div>
                </div>
                <div className="card">
                  <div className="card-title">DNU list / Blocked</div>
                  <div className="card-value">{dispatchStats.red}</div>
                  <div className="card-subtext">Forced Red eligibility</div>
                </div>
              </div>

              {/* Search & Filter Controls */}
              <div className="table-filters">
                <div className="filter-group">
                  <input 
                    type="text" 
                    placeholder="Search by legal name, DOT#, MC#..." 
                    className="search-input"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                  />
                  
                  <select 
                    className="select-input"
                    value={filterQuality}
                    onChange={(e) => {
                      setFilterQuality(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="all">All Quality Tiers</option>
                    <option value="excellent">Excellent (≥80)</option>
                    <option value="good">Good (60-79)</option>
                    <option value="fair">Fair (40-59)</option>
                    <option value="poor">Poor (&lt;40)</option>
                  </select>

                  <select 
                    className="select-input"
                    value={filterDispatch}
                    onChange={(e) => {
                      setFilterDispatch(e.target.value);
                      setCurrentPage(1);
                    }}
                  >
                    <option value="all">All Dispatch Bands</option>
                    <option value="green">Approved (Green)</option>
                    <option value="yellow">Needs Review (Yellow)</option>
                    <option value="orange">Restricted (Orange)</option>
                    <option value="red">Blocked (Red)</option>
                  </select>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Showing {sortedAndFilteredCarriers.length} of {CARRIER_POPULATION} Carriers
                </div>
              </div>

              {/* Main Directory Table */}
              <div className="table-container">
                <table className="rsos-table">
                  <thead>
                    <tr>
                      <th onClick={() => handleSort('name')} className="sortable">
                        Carrier Legal Name {sortField === 'name' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th onClick={() => handleSort('dot')} className="sortable">
                        DOT Number {sortField === 'dot' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th>MC Number</th>
                      <th onClick={() => handleSort('score')} className="sortable">
                        Vetting Score {sortField === 'score' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th>Quality Tier</th>
                      <th>Dispatch Status</th>
                      <th>Active Flags</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCarriers.map(c => {
                      const score = c.scoreResult.overall_score;
                      const quality = c.scoreResult.quality_band;
                      const dispatch = c.scoreResult.dispatch_band;
                      const isSelected = c.id === selectedCarrierId;

                      const flagsCount = 
                        (c.gates.authority_status === 'revoked' ? 1 : 0) +
                        (c.gates.safety_rating === 'conditional' || c.gates.safety_rating === 'unsatisfactory' ? 1 : 0) +
                        (c.gates.insurance_lapsed_or_below_min ? 1 : 0) +
                        (c.gates.on_dnu ? 1 : 0) +
                        (c.gates.confirmed_fraud ? 1 : 0) +
                        (c.gates.has_open_material_flag ? 1 : 0);

                      return (
                        <tr 
                          key={c.id}
                          onClick={() => {
                            setSelectedCarrierId(c.id);
                            // Open detail B2 Overview subtab
                            setActiveTab('carriers_detail');
                            setProfileSubTab('overview');
                          }}
                          style={isSelected ? { backgroundColor: 'var(--brand-navy-glow)' } : {}}
                        >
                          <td style={{ fontWeight: 600 }}>
                            {c.legal_name}
                            {c.is_named && <span style={{ marginLeft: '0.4rem', color: '#818cf8', fontSize: '0.7rem' }}>(Fixture {c.fixture_key})</span>}
                          </td>
                          <td className="mono-num">{c.dot_number}</td>
                          <td className="mono-num">{c.mc_number}</td>
                          <td className="mono-num" style={{ fontWeight: 700, fontSize: '0.95rem' }}>{score}</td>
                          <td>{renderQualityChip(quality)}</td>
                          <td>{renderDispatchSignal(dispatch)}</td>
                          <td>
                            {flagsCount > 0 ? (
                              <span className="anomaly-badge">
                                {flagsCount} Gate/Flag{flagsCount > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>None</span>
                            )}
                          </td>
                          <td className="text-right" onClick={(e) => e.stopPropagation()}>
                            <button 
                              className="action-bar-btn secondary"
                              style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={() => {
                                setSelectedCarrierId(c.id);
                                setActiveTab('carriers_detail');
                                setProfileSubTab('overview');
                              }}
                            >
                              Audit Record B2 ➡️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Table Pagination */}
                <div className="table-pagination">
                  <span>Page {currentPage} of {totalPages}</span>
                  <div className="pagination-controls">
                    <button 
                      className="pagination-btn"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(prev => prev - 1)}
                    >
                      Previous
                    </button>
                    <button 
                      className="pagination-btn"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(prev => prev + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: B2 - Carrier Profile / Score Detail (Anchor Screen) with Vetting Detail Sub-Modules (B5-B10) */}
          {activeTab === 'carriers_detail' && (
            <div>
              {/* Context-pinned Carrier Header Box (AD1) */}
              <div className="card mb-1" style={{ borderLeft: '4px solid var(--border-focus)' }}>
                <div className="flex-between">
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                      Active Audit Target
                    </span>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 850, margin: '0.2rem 0' }}>
                      {selectedCarrier.legal_name}
                      {selectedCarrier.is_named && (
                        <span className="provisional-badge" style={{ backgroundColor: 'var(--brand-navy-light)', marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                          Fixture ID: {selectedCarrier.fixture_key}
                        </span>
                      )}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                      DBA: {selectedCarrier.dba_name} | DOT: <strong className="mono-num">{selectedCarrier.dot_number}</strong> | MC: <strong className="mono-num">{selectedCarrier.mc_number}</strong> | Ph: {selectedCarrier.phone}
                    </p>
                  </div>
                  
                  {/* Pin Vetting Score & Eligibility right in the header */}
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', fontWeight: 600 }}>Quality Score</span>
                      <strong style={{ fontSize: '1.5rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}>
                        {selectedCarrier.scoreResult.overall_score}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', fontWeight: 600, marginBottom: '0.15rem' }}>Dispatch Status</span>
                      {renderDispatchSignal(selectedCarrier.scoreResult.dispatch_band)}
                    </div>
                  </div>
                </div>

                {/* Sub-tab navigation menu */}
                <div className="queue-header-tabs" style={{ marginTop: '1.5rem', marginBottom: '0' }}>
                  <div className={`queue-tab ${profileSubTab === 'overview' ? 'active' : ''}`} onClick={() => setProfileSubTab('overview')}>
                    Overview &amp; Score
                  </div>
                  <div className={`queue-tab ${profileSubTab === 'drivers' ? 'active' : ''}`} onClick={() => setProfileSubTab('drivers')}>
                    Drivers ({selectedCarrier.driversRoster.length})
                  </div>
                  <div className={`queue-tab ${profileSubTab === 'equipment' ? 'active' : ''}`} onClick={() => setProfileSubTab('equipment')}>
                    Equipment ({selectedCarrier.equipmentRoster.length})
                  </div>
                  <div className={`queue-tab ${profileSubTab === 'insurance' ? 'active' : ''}`} onClick={() => setProfileSubTab('insurance')}>
                    Insurance Vetting ({selectedCarrier.coiOcr.review_status === 'pending' ? '⚠️ ' : ''}Gate)
                  </div>
                  <div className={`queue-tab ${profileSubTab === 'claims' ? 'active' : ''}`} onClick={() => setProfileSubTab('claims')}>
                    Claims ({selectedCarrier.claimsRoster.length})
                  </div>
                  <div className={`queue-tab ${profileSubTab === 'fmcsa' ? 'active' : ''}`} onClick={() => setProfileSubTab('fmcsa')}>
                    FMCSA logs (Adapter)
                  </div>
                  <div className={`queue-tab ${profileSubTab === 'documents' ? 'active' : ''}`} onClick={() => setProfileSubTab('documents')}>
                    Attachments ({selectedCarrier.documentsRoster.length})
                  </div>
                </div>
              </div>

              {/* PROFILE SUB-TAB: Overview */}
              {profileSubTab === 'overview' && (
                <div className="carrier-detail-grid">
                  
                  {/* Left Column: Dossier Details, Scores, Flags */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Score Breakdown (B2) */}
                    <div className="card">
                      <h3 className="section-title">Composite Vetting Score Breakdown</h3>
                      <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem' }}>
                        
                        <div className="score-gauge-ring" style={{ width: '100px', height: '100px', fontSize: '1.8rem', '--fill-percent': `${selectedCarrier.scoreResult.overall_score}%`, '--fill-color': 'var(--tier-excellent-bg)' } as any}>
                          <span className="score-gauge-ring-val">{selectedCarrier.scoreResult.overall_score}</span>
                        </div>

                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                            Score calculated deterministically via the canonical FMCSA scoring engine. High = Good (safer).
                          </p>
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.5rem' }}>
                            Formula: 0.15·fleet_size + 0.20·vehicle_oos + 0.25·driver_oos + 0.40·accident_rate
                          </p>
                          {selectedCarrier.gates.is_thin_file && (
                            <div className="provisional-badge" style={{ marginTop: '0.5rem', color: 'var(--dispatch-yellow-text)', borderColor: 'var(--dispatch-yellow-border)' }}>
                              ⚠️ Low Data Confidence blend active (blend towards neutral 50)
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="score-gauge-factors">
                        {/* Accident Rate - heaviest (40%) */}
                        <div className="factor-row" style={{ cursor: 'pointer' }} onClick={() => setProfileSubTab('claims')}>
                          <div className="factor-meta">
                            <span className="factor-name" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                              Accident Rate Score <span className="factor-weight">(40% Weight - Heaviest Factor)</span>
                            </span>
                            <span className="factor-value text-success">{selectedCarrier.inputs.accident_rate_score} / 100</span>
                          </div>
                          <div className="factor-progress-bg">
                            <div className="factor-progress-fill" style={{ width: `${selectedCarrier.inputs.accident_rate_score}%`, backgroundColor: '#34d399' }} />
                          </div>
                        </div>

                        {/* Driver OOS (25%) */}
                        <div className="factor-row" style={{ cursor: 'pointer' }} onClick={() => setProfileSubTab('drivers')}>
                          <div className="factor-meta">
                            <span className="factor-name">Driver Out-Of-Service Score <span className="factor-weight">(25% Weight)</span></span>
                            <span className="factor-value">{selectedCarrier.inputs.driver_oos_score} / 100</span>
                          </div>
                          <div className="factor-progress-bg">
                            <div className="factor-progress-fill" style={{ width: `${selectedCarrier.inputs.driver_oos_score}%`, backgroundColor: '#60a5fa' }} />
                          </div>
                        </div>

                        {/* Vehicle OOS (20%) */}
                        <div className="factor-row" style={{ cursor: 'pointer' }} onClick={() => setProfileSubTab('equipment')}>
                          <div className="factor-meta">
                            <span className="factor-name">Vehicle Out-Of-Service Score <span className="factor-weight">(20% Weight)</span></span>
                            <span className="factor-value">{selectedCarrier.inputs.vehicle_oos_score} / 100</span>
                          </div>
                          <div className="factor-progress-bg">
                            <div className="factor-progress-fill" style={{ width: `${selectedCarrier.inputs.vehicle_oos_score}%`, backgroundColor: '#818cf8' }} />
                          </div>
                        </div>

                        {/* Fleet Size (15%) */}
                        <div className="factor-row">
                          <div className="factor-meta">
                            <span className="factor-name">Fleet Size Score <span className="factor-weight">(15% Weight)</span></span>
                            <span className="factor-value">{selectedCarrier.inputs.fleet_size_score} / 100</span>
                          </div>
                          <div className="factor-progress-bg">
                            <div className="factor-progress-fill" style={{ width: `${selectedCarrier.inputs.fleet_size_score}%`, backgroundColor: '#94a3b8' }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Insurance Policy summary */}
                    <div className="card">
                      <div className="flex-between">
                        <h3 className="section-title">Insurance policy hard gates</h3>
                        <button className="action-bar-btn secondary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => setProfileSubTab('insurance')}>
                          Full COI Review Workspace ➡️
                        </button>
                      </div>
                      
                      <table className="insurance-policies-table">
                        <thead>
                          <tr>
                            <th>Policy</th>
                            <th>Forrest Min</th>
                            <th>Carrier Limit</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ fontWeight: 600 }}>Auto Liability</td>
                            <td className="mono-num">$1,000,000</td>
                            <td className="mono-num">${selectedCarrier.insurance.auto_liability.toLocaleString()}</td>
                            <td>
                              <span className={`gate-status-pill ${selectedCarrier.insurance.auto_liability >= INSURANCE_MINIMUMS.auto_liability ? 'pass' : 'fail'}`}>
                                {selectedCarrier.insurance.auto_liability >= INSURANCE_MINIMUMS.auto_liability ? 'Pass' : 'Below Min'}
                              </span>
                            </td>
                          </tr>
                          <tr>
                            <td style={{ fontWeight: 600 }}>Cargo Liability</td>
                            <td className="mono-num">$100,000</td>
                            <td className="mono-num">${selectedCarrier.insurance.cargo.toLocaleString()}</td>
                            <td>
                              <span className={`gate-status-pill ${selectedCarrier.insurance.cargo >= INSURANCE_MINIMUMS.cargo ? 'pass' : 'fail'}`}>
                                {selectedCarrier.insurance.cargo >= INSURANCE_MINIMUMS.cargo ? 'Pass' : 'Below Min'}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Blue Wire Inactive */}
                    <div className="blue-wire-disabled-card">
                      <div className="disabled-watermark">⚠️ Blue Wire Layer Inactive</div>
                      <h4 className="blue-wire-disabled-title">Blue Wire Weights Integration (Pending Stakeholder Signoff Q2)</h4>
                    </div>
                  </div>

                  {/* Right Column: Vetting status, Gates, Dossiers, Audits */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    {/* Gate & Vetting checklist */}
                    <div className="card">
                      <h3 className="section-title">Critical Hard Gates Vetting checklist</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        <div className="flex-between">
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Operating Authority</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Status: {selectedCarrier.authority_status}</div>
                          </div>
                          <span className={`gate-status-pill ${selectedCarrier.authority_status === 'active' ? 'pass' : 'fail'}`}>
                            {selectedCarrier.authority_status === 'active' ? 'Active' : 'Revoked/Inactive'}
                          </span>
                        </div>

                        <div className="flex-between">
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Safety Rating (FMCSA)</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Rating: {selectedCarrier.safety_rating}</div>
                          </div>
                          <span className={`gate-status-pill ${selectedCarrier.safety_rating !== 'conditional' && selectedCarrier.safety_rating !== 'unsatisfactory' ? 'pass' : 'fail'}`}>
                            {selectedCarrier.safety_rating === 'satisfactory' ? 'Satisfactory' : (selectedCarrier.safety_rating === 'unrated' ? 'Unrated (Pass)' : 'Conditional/Unsat')}
                          </span>
                        </div>

                        <div className="flex-between">
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Internal DNU Block Status</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Is Blocked: {selectedCarrier.gates.on_dnu ? 'Yes' : 'No'}</div>
                          </div>
                          <span className={`gate-status-pill ${!selectedCarrier.gates.on_dnu ? 'pass' : 'fail'}`}>
                            {!selectedCarrier.gates.on_dnu ? 'Not Blocked' : 'Blocked (DNU)'}
                          </span>
                        </div>

                        <div className="flex-between">
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Identity Verification / Fraud</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Is Confirmed Fraud: {selectedCarrier.gates.confirmed_fraud ? 'Yes' : 'No'}</div>
                          </div>
                          <span className={`gate-status-pill ${!selectedCarrier.gates.confirmed_fraud ? 'pass' : 'fail'}`}>
                            {!selectedCarrier.gates.confirmed_fraud ? 'Verified' : 'FRAUD RED'}
                          </span>
                        </div>
                      </div>

                      {/* Review Action Panel */}
                      <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '1.5rem', paddingTop: '1.25rem' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
                          Review Action Panel
                        </h4>
                        
                        {selectedCarrier.gates.on_dnu ? (
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            This carrier is locked to DNU status. Only VP roles may override.
                          </p>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {selectedCarrier.scoreResult.dispatch_band === 'yellow' && persona === 'danica' && (
                              <button 
                                className="action-bar-btn" 
                                style={{ flex: 1 }}
                                onClick={() => {
                                  setActiveTab('tasks');
                                  setTriageQueueTab('remediation');
                                  setActiveRemediationDossierId(selectedCarrier.id);
                                }}
                              >
                                Open Dossier B3
                              </button>
                            )}
                            {selectedCarrier.scoreResult.dispatch_band === 'green' && selectedCarrier.ab5_status !== 'na' && persona === 'danica' && (
                              <button 
                                className="action-bar-btn" 
                                style={{ flex: 1 }}
                                onClick={() => handleClearOnboarding(selectedCarrier.id)}
                              >
                                Clear Onboarding
                              </button>
                            )}
                            <button 
                              className="action-bar-btn" 
                              style={{ flex: 1, backgroundColor: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#f87171' }}
                              onClick={() => handleDnuBlock(selectedCarrier.id)}
                            >
                              Place on DNU list
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Audit Trail & Vetting Logs */}
                    <div className="card">
                      <h3 className="section-title">Audit Trail & Vetting logs</h3>
                      <div className="audit-stream">
                        {auditLogs
                          .filter(log => log.carrier_id === selectedCarrier.id)
                          .map(log => (
                            <div key={log.id} className="audit-item">
                              <div className="audit-meta">
                                <span>{log.performed_by}</span>
                                <span>{new Date(log.performed_at).toLocaleDateString()}</span>
                              </div>
                              <div className="audit-content">{log.details}</div>
                              {log.reason && (
                                <div className="audit-note">
                                  <strong>Rationale: </strong> {log.reason}
                                </div>
                              )}
                            </div>
                          ))}
                        {auditLogs.filter(log => log.carrier_id === selectedCarrier.id).length === 0 && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No status modifications logged for this carrier.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PROFILE SUB-TAB: Drivers (B5 - Score-Factor Detail) */}
              {profileSubTab === 'drivers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* B5 Driver Score Linkage Panel (AD2) */}
                  <div className="card" style={{ borderLeft: '4px solid #60a5fa' }}>
                    <div className="flex-between">
                      <div>
                        <h3 className="section-title" style={{ color: '#60a5fa', marginBottom: '0.25rem' }}>
                          Driver Out-Of-Service (OOS) Score Linkage
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '80ch' }}>
                          Driver compliance is a **weighted score factor** (25% weight). Standard inspections and driver-level OOS violations roll up dynamically into the factor score shown below. Fewer driver OOS events lead to higher compliance scores.
                        </p>
                      </div>
                      
                      <div style={{ textAlign: 'right', minWidth: '150px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Driver OOS Factor Score
                        </span>
                        <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'JetBrains Mono', color: '#60a5fa' }}>
                          {selectedCarrier.inputs.driver_oos_score} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ 100</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Weight: 25% of Composite
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Driver Roster Directory */}
                  <div className="card">
                    <h3 className="section-title">Active Driver Vetting Roster</h3>
                    
                    <div className="table-container">
                      <table className="rsos-table">
                        <thead>
                          <tr>
                            <th>Driver Name</th>
                            <th>CDL License Number</th>
                            <th>Vetting Status</th>
                            <th>Inspections (24 Mo)</th>
                            <th>OOS Events</th>
                            <th>Last Inspection</th>
                            <th>OOS Violations / Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCarrier.driversRoster.map((d, index) => (
                            <tr key={index}>
                              <td style={{ fontWeight: 600 }}>{d.name}</td>
                              <td className="mono-num">{d.license_number}</td>
                              <td>
                                <span className={`gate-status-pill ${d.status === 'active' ? 'pass' : 'fail'}`}>
                                  {d.status === 'active' ? 'Active' : 'OOS Blocked'}
                                </span>
                              </td>
                              <td className="mono-num">{d.inspections_count}</td>
                              <td className="mono-num" style={{ fontWeight: d.oos_events_count > 0 ? 700 : 'inherit', color: d.oos_events_count > 0 ? '#ef4444' : 'inherit' }}>
                                {d.oos_events_count}
                              </td>
                              <td className="mono-num">{d.last_inspection_date}</td>
                              <td style={{ fontSize: '0.8rem', color: d.status === 'oos' ? '#fca5a5' : 'var(--text-secondary)' }}>
                                {d.violations.length > 0 ? d.violations.join(', ') : 'Clean record'}
                              </td>
                            </tr>
                          ))}
                          {selectedCarrier.driversRoster.length === 0 && (
                            <tr>
                              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                No driver records returned by adapter. Carrier is unrated / thin-file.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* PROFILE SUB-TAB: Equipment (B6 - Score-Factor Detail) */}
              {profileSubTab === 'equipment' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* B6 Equipment Score Linkage Panel (AD2) */}
                  <div className="card" style={{ borderLeft: '4px solid #818cf8' }}>
                    <div className="flex-between">
                      <div>
                        <h3 className="section-title" style={{ color: '#818cf8', marginBottom: '0.25rem' }}>
                          Vehicle Out-Of-Service (OOS) Score Linkage
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '80ch' }}>
                          Vehicle &amp; Equipment safety is a **weighted score factor** (20% weight). Out-Of-Service inspection events and mechanical defects factor directly into the final scorecard.
                        </p>
                      </div>
                      
                      <div style={{ textAlign: 'right', minWidth: '150px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                          Vehicle OOS Factor Score
                        </span>
                        <div style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'JetBrains Mono', color: '#818cf8' }}>
                          {selectedCarrier.inputs.vehicle_oos_score} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ 100</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Weight: 20% of Composite
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Samsara telemetry split banner */}
                  <div className="banner" style={{ backgroundColor: 'rgba(245, 158, 11, 0.05)', borderColor: 'rgba(245, 158, 11, 0.15)' }}>
                    <span className="banner-icon">ℹ️</span>
                    <div className="banner-content" style={{ color: '#fef3c7' }}>
                      <strong>Own Fleet Separation Reminder</strong>: Our own ~22 power units are managed separately under the <strong>Own-Fleet Safety</strong> tab using Samsara live telemetry. Roster assets listed below represent external third-party carrier equipment only (never merged).
                    </div>
                  </div>

                  {/* Equipment Table */}
                  <div className="card">
                    <h3 className="section-title">Equipment Vetting Registry</h3>
                    
                    <div className="table-container">
                      <table className="rsos-table">
                        <thead>
                          <tr>
                            <th>Unit ID</th>
                            <th>Equipment Type</th>
                            <th>VIN Number</th>
                            <th>License Plate</th>
                            <th>Vetting Status</th>
                            <th>Last Inspection</th>
                            <th>Active Violations</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCarrier.equipmentRoster.map((eq, index) => (
                            <tr key={index}>
                              <td style={{ fontWeight: 700 }}>{eq.unit_number}</td>
                              <td style={{ textTransform: 'capitalize' }}>{eq.type}</td>
                              <td className="mono-num">{eq.vin}</td>
                              <td className="mono-num">{eq.plate_number}</td>
                              <td>
                                <span className={`gate-status-pill ${eq.status === 'active' ? 'pass' : 'fail'}`}>
                                  {eq.status === 'active' ? 'Active' : 'OOS Defect'}
                                </span>
                              </td>
                              <td className="mono-num">{eq.last_inspection_date}</td>
                              <td style={{ fontSize: '0.8rem', color: eq.status === 'oos' ? '#fca5a5' : 'var(--text-secondary)' }}>
                                {eq.violations.length > 0 ? eq.violations.join(', ') : 'No active vehicle defects'}
                              </td>
                            </tr>
                          ))}
                          {selectedCarrier.equipmentRoster.length === 0 && (
                            <tr>
                              <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                No vehicle records found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* PROFILE SUB-TAB: Insurance Vetting (B7 - Hard Gate & COI Review Surface) */}
              {profileSubTab === 'insurance' && (
                <div className="carrier-detail-grid">
                  
                  {/* Left Column: COI OCR Parser Workspace (AD3) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="card">
                      <div className="flex-between mb-1">
                        <h3 className="section-title">OCR-Parsed COI Review Workspace</h3>
                        <span className="provisional-badge" style={{ color: 'var(--dispatch-yellow-text)', borderColor: 'var(--dispatch-yellow-border)' }}>
                          HUMAN-IN-THE-LOOP APPROVAL REQUIRED
                        </span>
                      </div>
                      
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                        The system parsed the uploaded Certificate of Insurance (COI) using OCR. Review the parsed boundaries against Forrest required minimums. **The system will never auto-approve a policy.** Reviewer signoff is the gate.
                      </p>

                      {/* OCR Fields Verification Grid */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.02)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <div className="flex-between">
                          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Insurer Name (OCR Parsed):</span>
                          <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{selectedCarrier.coiOcr.insurer_name}</span>
                        </div>
                        
                        <div className="flex-between" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                          <div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block' }}>Auto Liability Coverage:</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Required: $1,000,000</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong className="mono-num" style={{ display: 'block' }}>${selectedCarrier.coiOcr.auto_limit.toLocaleString()}</strong>
                            <span className={`gate-status-pill ${selectedCarrier.coiOcr.auto_limit >= INSURANCE_MINIMUMS.auto_liability ? 'pass' : 'fail'}`}>
                              {selectedCarrier.coiOcr.auto_limit >= INSURANCE_MINIMUMS.auto_liability ? 'Limit Ok' : 'INSUFFICIENT'}
                            </span>
                          </div>
                        </div>

                        <div className="flex-between" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                          <div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block' }}>Cargo Liability Coverage:</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Required: $100,000</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong className="mono-num" style={{ display: 'block' }}>${selectedCarrier.coiOcr.cargo_limit.toLocaleString()}</strong>
                            <span className={`gate-status-pill ${selectedCarrier.coiOcr.cargo_limit >= INSURANCE_MINIMUMS.cargo ? 'pass' : 'fail'}`}>
                              {selectedCarrier.coiOcr.cargo_limit >= INSURANCE_MINIMUMS.cargo ? 'Limit Ok' : 'INSUFFICIENT'}
                            </span>
                          </div>
                        </div>

                        <div className="flex-between" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                          <div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block' }}>Trailer Interchange Coverage:</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Required: $30,000</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong className="mono-num" style={{ display: 'block' }}>${selectedCarrier.coiOcr.trailer_interchange_limit.toLocaleString()}</strong>
                            <span className={`gate-status-pill ${selectedCarrier.coiOcr.trailer_interchange_limit >= INSURANCE_MINIMUMS.trailer_interchange ? 'pass' : 'fail'}`}>
                              {selectedCarrier.coiOcr.trailer_interchange_limit >= INSURANCE_MINIMUMS.trailer_interchange ? 'Limit Ok' : 'INSUFFICIENT'}
                            </span>
                          </div>
                        </div>

                        <div className="flex-between" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem' }}>
                          <div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block' }}>Workers Compensation Coverage:</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Required: Yes</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong style={{ display: 'block', fontSize: '0.88rem' }}>{selectedCarrier.coiOcr.workers_comp_status ? 'Active Policy' : 'No Policy Found'}</strong>
                            <span className={`gate-status-pill ${selectedCarrier.coiOcr.workers_comp_status ? 'pass' : 'fail'}`}>
                              {selectedCarrier.coiOcr.workers_comp_status ? 'Pass' : 'Missing'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Human gate action panel (B7 & AD3) */}
                      <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                          Reviewer Audit Rationale (Required)
                        </label>
                        <input 
                          type="text" 
                          placeholder="Provide audit notes for COI review decision..." 
                          className="search-input"
                          style={{ width: '100%', marginBottom: '1rem' }}
                          value={coiReason}
                          onChange={(e) => setCoiReason(e.target.value)}
                        />

                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                          <button 
                            className="action-bar-btn"
                            style={{ flex: 1, backgroundColor: 'var(--border-focus)' }}
                            onClick={() => handleCoiApprove(selectedCarrier.id)}
                          >
                            ✔️ Approve COI Limits (Clear Gate)
                          </button>
                          <button 
                            className="action-bar-btn"
                            style={{ flex: 1, backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#f87171' }}
                            onClick={() => handleCoiReject(selectedCarrier.id)}
                          >
                            ❌ Reject / Flag Below Min (Trigger Red Gate)
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Active Policy list & OCR verification trails */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="card">
                      <h3 className="section-title">COI Review Verdict</h3>
                      
                      <div style={{ marginBottom: '1.25rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Vetting Status:</span>
                        <div style={{ marginTop: '0.4rem' }}>
                          {selectedCarrier.coiOcr.review_status === 'approved' && (
                            <span className="gate-status-pill pass" style={{ fontSize: '0.95rem', padding: '0.4rem 0.8rem' }}>APPROVED PASS</span>
                          )}
                          {selectedCarrier.coiOcr.review_status === 'rejected' && (
                            <span className="gate-status-pill fail" style={{ fontSize: '0.95rem', padding: '0.4rem 0.8rem' }}>REJECTED FAILS GATE</span>
                          )}
                          {selectedCarrier.coiOcr.review_status === 'pending' && (
                            <span className="gate-status-pill fail" style={{ fontSize: '0.95rem', padding: '0.4rem 0.8rem', backgroundColor: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' }}>PENDING MANUAL REVIEW</span>
                          )}
                        </div>
                      </div>

                      {selectedCarrier.coiOcr.reviewed_by && (
                        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <div><strong>Reviewed By:</strong> {selectedCarrier.coiOcr.reviewed_by}</div>
                          <div><strong>Date:</strong> {new Date(selectedCarrier.coiOcr.reviewed_at || '').toLocaleString()}</div>
                          {selectedCarrier.coiOcr.rejection_reason && (
                            <div className="audit-note" style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                              <strong>Reason:</strong> {selectedCarrier.coiOcr.rejection_reason}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="card">
                      <h3 className="section-title">Evidentiary Attachments</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                        Certificate PDF uploaded by the carrier and queued for OCR processing:
                      </p>
                      
                      <div className="audit-note" style={{ cursor: 'pointer' }} onClick={() => handleDocPreview(selectedCarrier.fixture_key === 'C4' ? 'coi_certificate_50k_cargo.pdf' : 'coi_insurance_certificate_2026.pdf')}>
                        📁 <strong>{selectedCarrier.fixture_key === 'C4' ? 'coi_certificate_50k_cargo.pdf' : 'coi_insurance_certificate_2026.pdf'}</strong>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          Uploaded: {selectedCarrier.fixture_key === 'C4' ? '2026-03-01' : '2026-01-02'} | Size: 240 KB
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--border-focus)', display: 'block', marginTop: '0.35rem' }}>
                          Click to Preview document ➡️
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PROFILE SUB-TAB: Claims (B8 - Flag/Gate Detail) */}
              {profileSubTab === 'claims' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* B8 Claims non-score reminder alert (AD2) */}
                  <div className="banner">
                    <span className="banner-icon">🛡️</span>
                    <div className="banner-content">
                      <strong>Claims Compliance Notification</strong>: Claims history is maintained strictly as an **informational risk flag and gate**. Claims counts and severity indicators **do NOT feed or weight** the numeric carrier safety score.
                    </div>
                  </div>

                  {/* Claims Statistics Card */}
                  <div className="grid-cols-3">
                    <div className="card">
                      <div className="card-title">Claims Frequency (24 Mo)</div>
                      <div className="card-value">{selectedCarrier.claimsRoster.length}</div>
                      <div className="card-subtext">Registered incidents</div>
                    </div>
                    <div className="card">
                      <div className="card-title">Cumulative Exposure</div>
                      <div className="card-value">
                        ${selectedCarrier.claimsRoster.reduce((sum, cl) => sum + cl.amount, 0).toLocaleString()}
                      </div>
                      <div className="card-subtext">Estimated aggregate loss</div>
                    </div>
                    <div className="card">
                      <div className="card-title">Open Dispute Cases</div>
                      <div className="card-value">
                        {selectedCarrier.claimsRoster.filter(cl => cl.status === 'open').length}
                      </div>
                      <div className="card-subtext">Pending adjusters resolution</div>
                    </div>
                  </div>

                  {/* Claims Table */}
                  <div className="card">
                    <h3 className="section-title">Loss &amp; Claims History dossier</h3>
                    
                    <div className="table-container">
                      <table className="rsos-table">
                        <thead>
                          <tr>
                            <th>Claim ID</th>
                            <th>Occurrence Date</th>
                            <th>Loss Category</th>
                            <th>Exposure Value</th>
                            <th>Case Status</th>
                            <th>Loss Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCarrier.claimsRoster.map((cl) => (
                            <tr key={cl.id}>
                              <td style={{ fontWeight: 700 }}>{cl.id}</td>
                              <td className="mono-num">{cl.incident_date}</td>
                              <td style={{ textTransform: 'capitalize' }}>
                                {cl.claim_type.replace('_', ' ')}
                              </td>
                              <td className="mono-num" style={{ color: cl.amount > 20000 ? '#f87171' : 'inherit' }}>
                                ${cl.amount.toLocaleString()}
                              </td>
                              <td>
                                <span className={`gate-status-pill ${cl.status === 'closed' ? 'pass' : 'fail'}`} style={{ backgroundColor: cl.status === 'closed' ? '' : 'rgba(251, 191, 36, 0.15)', color: cl.status === 'closed' ? '' : '#fbbf24' }}>
                                  {cl.status === 'closed' ? 'Closed' : 'Dispute Open'}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{cl.description}</td>
                            </tr>
                          ))}
                          {selectedCarrier.claimsRoster.length === 0 && (
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                Clean claims file. No cargo losses or liability claims registered in the past 24 months.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* PROFILE SUB-TAB: FMCSA Monitoring (B9 - Transition-Aware) */}
              {profileSubTab === 'fmcsa' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* B9 MOTUS transition status header warning (AD4) */}
                  <div className="banner" style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.15)' }}>
                    <span className="banner-icon">📡</span>
                    <div className="banner-content" style={{ color: '#fca5a5' }}>
                      <strong>Active Source State: adapter-pending (FMCSA→MOTUS)</strong>. FMCSA is undergoing the MOTUS registration transition. Field layouts shown here are provisonally structured behind the adapter layer and are subject to adapter sweeps.
                    </div>
                  </div>

                  {/* FMCSA Monitoring logs */}
                  <div className="card">
                    <h3 className="section-title">FMCSA Alert &amp; Status Logs</h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                      Change monitoring alerts that trigger safety escalations. Revocation alerts immediately flag the carrier as DNU (Blocked RED).
                    </p>

                    <div className="table-container">
                      <table className="rsos-table">
                        <thead>
                          <tr>
                            <th>Alert Category</th>
                            <th>Pre-Alert Value</th>
                            <th>Post-Alert Value</th>
                            <th>Log Date</th>
                            <th>Adapter Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCarrier.fmcsaLogs.map((log, index) => (
                            <tr key={index}>
                              <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                                {log.event_type.replace(/_/g, ' ')}
                              </td>
                              <td className="mono-num" style={{ textTransform: 'capitalize' }}>{log.old_value}</td>
                              <td className="mono-num" style={{ textTransform: 'capitalize', fontWeight: 700, color: log.new_value === 'revoked' || log.new_value === 'conditional' ? '#ef4444' : 'inherit' }}>
                                {log.new_value}
                              </td>
                              <td className="mono-num">{log.date}</td>
                              <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }}>
                                {log.source}
                              </td>
                            </tr>
                          ))}
                          {selectedCarrier.fmcsaLogs.length === 0 && (
                            <tr>
                              <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                No safety logs returned by adapter. Carrier status has been stable.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* PROFILE SUB-TAB: Documents (B10 - Design-Layer Only) */}
              {profileSubTab === 'documents' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* B10 Platform Agnostic Banner (AD5) */}
                  <div className="banner" style={{ backgroundColor: 'var(--brand-navy-glow)', borderColor: 'var(--border-color)' }}>
                    <span className="banner-icon">📂</span>
                    <div className="banner-content">
                      <strong>Evidentiary Dossier Storage</strong>: Document listings are maintained purely at the presentation layer for the litigation due-diligence audit trail. (SharePoint API connectors are dormant pending final Q7 platform mandate).
                    </div>
                  </div>

                  <div className="card">
                    <div className="flex-between mb-1">
                      <h3 className="section-title">Audit Trail Evidentiary Documents</h3>
                      <button className="action-bar-btn" onClick={() => alert('Mock Upload: File dialog triggered (Design Layer only).')}>
                        + Upload Evidentiary PDF
                      </button>
                    </div>

                    <div className="table-container">
                      <table className="rsos-table">
                        <thead>
                          <tr>
                            <th>Document Filename</th>
                            <th>Attachment Type</th>
                            <th>Upload Date</th>
                            <th>File Size</th>
                            <th>Audit Status</th>
                            <th className="text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCarrier.documentsRoster.map((doc, index) => (
                            <tr key={index}>
                              <td style={{ fontWeight: 600 }}>{doc.name}</td>
                              <td style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontFamily: 'JetBrains Mono' }}>{doc.type}</td>
                              <td className="mono-num">{doc.uploaded_date}</td>
                              <td className="mono-num">{doc.file_size}</td>
                              <td>
                                <span className={`gate-status-pill ${doc.status === 'verified' ? 'pass' : (doc.status === 'pending' ? 'fail' : '')}`} style={doc.status === 'pending' ? { backgroundColor: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' } : (doc.status === 'archived' ? { backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' } : {})}>
                                  {doc.status}
                                </span>
                              </td>
                              <td className="text-right">
                                <button className="action-bar-btn secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => handleDocPreview(doc.name)}>
                                  Preview File ➡️
                                </button>
                              </td>
                            </tr>
                          ))}
                          {selectedCarrier.documentsRoster.length === 0 && (
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                                No document logs loaded in state.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* VIEW: B3 - Danica: Triage & Remediation Queues */}
          {activeTab === 'tasks' && (
            <div>
              {/* Queue switch tabs */}
              <div className="queue-header-tabs">
                <div 
                  className={`queue-tab ${triageQueueTab === 'onboarding' ? 'active' : ''}`}
                  onClick={() => {
                    setTriageQueueTab('onboarding');
                    setActiveRemediationDossierId(null);
                  }}
                >
                  Green Onboarding Queue ({onboardingQueue.length})
                </div>
                <div 
                  className={`queue-tab ${triageQueueTab === 'remediation' ? 'active' : ''}`}
                  onClick={() => setTriageQueueTab('remediation')}
                >
                  Yellow Remediation Dossiers ({remediationQueue.length})
                </div>
              </div>

              {/* TAB CONTENT: Onboarding */}
              {triageQueueTab === 'onboarding' && (
                <div>
                  <div className="banner" style={{ backgroundColor: 'rgba(52, 211, 153, 0.05)', borderColor: 'rgba(52, 211, 153, 0.15)' }}>
                    <span className="banner-icon" style={{ color: '#34d399' }}>✅</span>
                    <div className="banner-content" style={{ color: '#a7f3d0' }}>
                      These carriers have Excellent/Good quality scores and pass all hard gates, but require final onboarding clearance (e.g. AB5 status attested) before dispatch blocks are removed.
                    </div>
                  </div>

                  <div className="table-container">
                    <table className="rsos-table">
                      <thead>
                        <tr>
                          <th>Carrier Legal Name</th>
                          <th>DOT Number</th>
                          <th>Composite Score</th>
                          <th>Quality band</th>
                          <th>AB5 Status</th>
                          <th>Verification</th>
                          <th className="text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {onboardingQueue.map(c => (
                          <tr key={c.id} onClick={() => { setSelectedCarrierId(c.id); setActiveTab('carriers_detail'); setProfileSubTab('overview'); }}>
                            <td style={{ fontWeight: 600 }}>{c.legal_name}</td>
                            <td className="mono-num">{c.dot_number}</td>
                            <td className="mono-num" style={{ fontWeight: 700 }}>{c.scoreResult.overall_score}</td>
                            <td>{renderQualityChip(c.scoreResult.quality_band)}</td>
                            <td>
                              <span className="gate-status-pill fail" style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' }}>
                                {c.ab5_status}
                              </span>
                            </td>
                            <td>
                              <span className={`gate-status-pill ${c.identity_verified ? 'pass' : 'fail'}`}>
                                {c.identity_verified ? 'Identity Ok' : 'Unverified'}
                              </span>
                            </td>
                            <td className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                                <button 
                                  className="action-bar-btn"
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                                  onClick={() => handleClearOnboarding(c.id)}
                                >
                                  Clear Onboarding
                                </button>
                                <button 
                                  className="action-bar-btn secondary"
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                                  onClick={() => {
                                    setSelectedCarrierId(c.id);
                                    setActiveTab('carriers_detail');
                                    setProfileSubTab('overview');
                                  }}
                                >
                                  View Audit
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {onboardingQueue.length === 0 && (
                          <tr>
                            <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                              All green onboarding queues are cleared.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: Remediation */}
              {triageQueueTab === 'remediation' && (
                <div className="grid-detail-layout">
                  {/* Left: Yellow Queue list */}
                  <div>
                    <div className="table-container">
                      <table className="rsos-table">
                        <thead>
                          <tr>
                            <th>Carrier Name</th>
                            <th>Score</th>
                            <th>Reason</th>
                            <th>Review Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {remediationQueue.map(c => {
                            const isRemediating = activeRemediationDossierId === c.id;
                            let flagReason = 'Thin file';
                            if (c.gates.has_open_material_flag) flagReason = 'Material safety flag';
                            
                            return (
                              <tr 
                                key={c.id} 
                                onClick={() => {
                                  setSelectedCarrierId(c.id);
                                  setActiveRemediationDossierId(c.id);
                                  // Reset checklist for Harbor Point Drayage (C3)
                                  if (c.id === 'c1000000-0000-0000-0000-000000000003') {
                                    setCheckedRemediationItems({
                                      explainOos: false,
                                      repairInvoice: false,
                                      driverCdl: false,
                                      checklistAdded: false,
                                    });
                                  }
                                }}
                                style={isRemediating ? { backgroundColor: 'var(--brand-navy-glow)' } : {}}
                              >
                                <td style={{ fontWeight: 600 }}>{c.legal_name}</td>
                                <td className="mono-num" style={{ fontWeight: 700 }}>{c.scoreResult.overall_score}</td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{flagReason}</td>
                                <td>
                                  <span className="gate-status-pill fail" style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24' }}>
                                    Needs Dossier
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Right: Active Dossier workspace */}
                  <div>
                    {activeRemediationDossierId ? (
                      <div className="card">
                        <div className="flex-between mb-1">
                          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Remediation Dossier</h3>
                          <span className="provisional-badge">DUE-DILIGENCE CASE</span>
                        </div>
                        
                        <div style={{ marginBottom: '1.25rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selected Carrier:</span>
                          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                            {carriers.find(c => c.id === activeRemediationDossierId)?.legal_name}
                          </div>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            DOT: {carriers.find(c => c.id === activeRemediationDossierId)?.dot_number}
                          </span>
                        </div>

                        {activeRemediationDossierId === 'c1000000-0000-0000-0000-000000000003' ? (
                          /* Interactive checklist for Harbor Point (C3) */
                          <div>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                              Follow Montgomery v. Caribe Transport due-diligence rules. Collect all required dossier details to clear this thin-file carrier:
                            </p>

                            <div className="remediation-checklist">
                              <label className="checklist-item">
                                <input 
                                  type="checkbox" 
                                  className="checklist-checkbox"
                                  checked={checkedRemediationItems.explainOos}
                                  onChange={(e) => setCheckedRemediationItems(prev => ({ ...prev, explainOos: e.target.checked }))}
                                />
                                <div className="checklist-text">
                                  <strong>Explain OOS Violation</strong>
                                  <div className="checklist-text-status">Obtain statement explaining the single vehicle OOS block.</div>
                                </div>
                              </label>

                              <label className="checklist-item">
                                <input 
                                  type="checkbox" 
                                  className="checklist-checkbox"
                                  checked={checkedRemediationItems.repairInvoice}
                                  onChange={(e) => setCheckedRemediationItems(prev => ({ ...prev, repairInvoice: e.target.checked }))}
                                />
                                <div className="checklist-text">
                                  <strong>Upload Repair Invoice</strong>
                                  <div className="checklist-text-status">Document proof that the brake pads were replaced.</div>
                                </div>
                              </label>

                              <label className="checklist-item">
                                <input 
                                  type="checkbox" 
                                  className="checklist-checkbox"
                                  checked={checkedRemediationItems.driverCdl}
                                  onChange={(e) => setCheckedRemediationItems(prev => ({ ...prev, driverCdl: e.target.checked }))}
                                />
                                <div className="checklist-text">
                                  <strong>Driver CDL &amp; Verification</strong>
                                  <div className="checklist-text-status">Scan and upload CDL card, confirm 2+ years clean record.</div>
                                </div>
                              </label>

                              <label className="checklist-item">
                                <input 
                                  type="checkbox" 
                                  className="checklist-checkbox"
                                  checked={checkedRemediationItems.checklistAdded}
                                  onChange={(e) => setCheckedRemediationItems(prev => ({ ...prev, checklistAdded: e.target.checked }))}
                                />
                                <div className="checklist-text">
                                  <strong>Pre-Trip Checklist Ratified</strong>
                                  <div className="checklist-text-status">Enforce daily driver pre-trip checklists.</div>
                                </div>
                              </label>
                            </div>

                            <div style={{ marginTop: '1.5rem' }}>
                              <button 
                                className="action-bar-btn"
                                style={{ width: '100%' }}
                                disabled={!(checkedRemediationItems.explainOos && checkedRemediationItems.repairInvoice && checkedRemediationItems.driverCdl && checkedRemediationItems.checklistAdded)}
                                onClick={() => submitRemediationDossier(activeRemediationDossierId)}
                              >
                                Submit &amp; Clear Carrier
                              </button>
                              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '0.4rem' }}>
                                (Requires checking all 4 collected items to enable)
                              </p>
                            </div>
                          </div>
                        ) : (
                          /* Static fallback for generic generated carriers */
                          <div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                              Generic generated carrier remediation requires qualitative reviewer dossier checklist compilation.
                            </p>
                            <button 
                              className="action-bar-btn"
                              style={{ width: '100%' }}
                              onClick={() => submitRemediationDossier(activeRemediationDossierId)}
                            >
                              Fast-Approve Generic Dossier (No Checklist)
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="card" style={{ borderStyle: 'dashed', textAlign: 'center', padding: '3rem' }}>
                        <span style={{ fontSize: '2rem' }}>📂</span>
                        <h4 style={{ fontWeight: 700, margin: '1rem 0 0.5rem' }}>No Dossier Selected</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Select a carrier from the Needs Review queue list to assemble and audit their safety remediation dossier.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW: B4 - Elizabeth: Fraud & Capacity Anomaly Risk Review */}
          {activeTab === 'risk_review' && (
            <div>
              <div className="banner" style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.15)' }}>
                <span className="banner-icon">🔍</span>
                <div className="banner-content" style={{ color: '#fca5a5' }}>
                  Elizabeth's Workspace: Reviewing anomalies, matching phone/address details across carrier profiles, and confirming fraud hard gates. All blocks write immutable audit logs.
                </div>
              </div>

              <div className="grid-detail-layout">
                {/* Left: Anomalous carriers list */}
                <div>
                  <h3 className="section-title">Flagged Anomalies Queue</h3>
                  <div className="table-container">
                    <table className="rsos-table">
                      <thead>
                        <tr>
                          <th>Legal Name</th>
                          <th>Score</th>
                          <th>Anomalies</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {anomalyCarriers.map(c => {
                          const isSelected = c.id === selectedCarrierId;
                          let anomalyText = 'CarrierAssure Divergence';
                          if (c.gates.confirmed_fraud) anomalyText = 'Identity Conflict';
                          else if (c.gates.authority_status === 'revoked') anomalyText = 'Authority Revoked';
                          
                          return (
                            <tr 
                              key={c.id}
                              onClick={() => setSelectedCarrierId(c.id)}
                              style={isSelected ? { backgroundColor: 'var(--brand-navy-glow)' } : {}}
                            >
                              <td style={{ fontWeight: 600 }}>{c.legal_name}</td>
                              <td className="mono-num">{c.scoreResult.overall_score}</td>
                              <td>
                                <span className="anomaly-badge">{anomalyText}</span>
                              </td>
                              <td>
                                <span className={`gate-status-pill ${c.scoreResult.dispatch_band === 'red' ? 'fail' : 'pass'}`}>
                                  {c.scoreResult.dispatch_band === 'red' ? 'Blocked' : 'Restricted'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right: Forensic details, matching records cross reference */}
                <div>
                  <div className="card">
                    <h3 className="section-title">Forensic Case Details</h3>
                    <div style={{ marginBottom: '1rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Subject:</span>
                      <div style={{ fontWeight: 800, fontSize: '1.25rem' }}>{selectedCarrier.legal_name}</div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        DOT: {selectedCarrier.dot_number} | Phone: {selectedCarrier.phone}
                      </span>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)', padding: '1rem 0' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Dossier Cross Reference Alerts (Shared Metadata)
                      </h4>

                      {/* Hard-coded address/phone matches for illustration */}
                      <div className="cross-ref-grid">
                        <div className="cross-ref-card">
                          <div className="cross-ref-name">Gulfstream Haulers Inc</div>
                          <div className="cross-ref-reason">⚠️ Phone Match</div>
                          <div className="cross-ref-dot">Shared: 713-555-0102</div>
                        </div>
                        <div className="cross-ref-card">
                          <div className="cross-ref-name">Carrier 411 Registry</div>
                          <div className="cross-ref-reason">⚠️ Address Match</div>
                          <div className="cross-ref-dot">Shared: Houston, TX Port Ave</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)', padding: '1rem 0' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Vetting Summary
                      </h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        This carrier exhibits a flag matching a known double-brokering phone number blacklist record. Detailed phone scans indicate registration loops.
                      </p>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                      <button 
                        className="action-bar-btn"
                        style={{ width: '100%', backgroundColor: '#ef4444' }}
                        onClick={() => handleDnuBlock(selectedCarrier.id)}
                      >
                        Confirm Fraud / Place on DNU Block
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: Own-Fleet Safety (Samsara telemetry view) */}
          {activeTab === 'own_fleet' && (
            <div>
              <div className="banner" style={{ backgroundColor: 'var(--brand-navy-glow)', borderColor: 'var(--border-color)' }}>
                <span className="banner-icon">🔋</span>
                <div className="banner-content">
                  <strong>Forrest Transportation Fleet (Samsara Telemetry)</strong>: Displays our own fleet of 22 power units. This is a separate, visually distinct view and is never merged into external carrier risk profiles.
                </div>
              </div>

              <div className="table-container">
                <table className="rsos-table">
                  <thead>
                    <tr>
                      <th>Unit Number</th>
                      <th>VIN</th>
                      <th>Equipment Type</th>
                      <th>Last Inspection Date</th>
                      <th>Maintenance status</th>
                      <th>HOS Status</th>
                      <th>Safety Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ownFleet.map(fa => (
                      <tr key={fa.id}>
                        <td style={{ fontWeight: 700 }}>{fa.unit_number}</td>
                        <td className="mono-num">{fa.vin}</td>
                        <td>{fa.type === 'day_cab' ? 'Day Cab' : 'Sleeper Truck'}</td>
                        <td className="mono-num">{fa.last_inspection}</td>
                        <td>
                          <span className={`gate-status-pill ${!fa.maintenance_due ? 'pass' : 'fail'}`}>
                            {!fa.maintenance_due ? 'Compliant' : 'Due Service'}
                          </span>
                        </td>
                        <td>
                          <span className={`gate-status-pill ${fa.hos_status === 'compliant' ? 'pass' : 'fail'}`}>
                            {fa.hos_status}
                          </span>
                        </td>
                        <td className="mono-num" style={{ fontWeight: 700 }}>{fa.safety_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW: Admin / Persona switcher & generic configurations */}
          {activeTab === 'admin' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '800px' }}>
              {/* Persona settings */}
              <div className="card">
                <h3 className="section-title">Vetting Configuration Options</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                      Active Persona switcher
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className={`action-bar-btn ${persona === 'danica' ? '' : 'secondary'}`} 
                        onClick={() => setPersona('danica')}
                      >
                        Danica (Triage Reviewer)
                      </button>
                      <button 
                        className={`action-bar-btn ${persona === 'elizabeth' ? '' : 'secondary'}`} 
                        onClick={() => setPersona('elizabeth')}
                      >
                        Elizabeth (Deep-Dive Analyst)
                      </button>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>Governance Rules Status</h4>
                    <ul style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', listStyleType: 'disc', paddingLeft: '1.25rem' }}>
                      <li>Dispatch Blocking enforced: <span className="text-warning">False (Ships dormant)</span></li>
                      <li>AI Vetting decisions: <span className="text-danger">Disabled (Human-in-the-loop)</span></li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* READ-ONLY EMPTY-STATE GOVERNANCE PREVIEW (Batch 2 OPTIONAL spec) */}
              <div className="card" style={{ border: '1px dashed var(--border-color)', opacity: 0.85 }}>
                <div className="flex-between mb-1">
                  <h3 className="section-title" style={{ color: 'var(--text-secondary)' }}>Governance Configuration preview</h3>
                  <span className="provisional-badge" style={{ color: 'var(--dispatch-yellow-text)', borderColor: 'var(--dispatch-yellow-border)' }}>
                    READ-ONLY PREVIEW
                  </span>
                </div>
                
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  This panel displays the placeholders for future append-only dated configuration adjustments. **All inputs are disabled. Example thresholds are not pre-populated.**
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', backgroundColor: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                  
                  {/* dispatch thresholds empty block */}
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                    <div className="flex-between">
                      <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>Dispatch R/Y/G Thresholds (Q1)</strong>
                      <span className="provisional-badge">Unratified</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Current state: **EMPTY / Awaiting Ratification**. Cuts are determined at runtime via standard defaults.
                    </p>
                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <div>Green cut: <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>[--]</span></div>
                      <div>Yellow cut: <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>[--]</span></div>
                    </div>
                  </div>

                  {/* blue wire weights empty block */}
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                    <div className="flex-between">
                      <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>Blue Wire composite Weights (Q2)</strong>
                      <span className="provisional-badge">Disabled</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Current state: **EMPTY / Inactive**. Standard FMCSA scorecard weights are enforced.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <div>Fleet Size: <span style={{ fontFamily: 'JetBrains Mono' }}>[--]</span></div>
                      <div>Vehicle OOS: <span style={{ fontFamily: 'JetBrains Mono' }}>[--]</span></div>
                      <div>Driver OOS: <span style={{ fontFamily: 'JetBrains Mono' }}>[--]</span></div>
                      <div>Accident Rate: <span style={{ fontFamily: 'JetBrains Mono' }}>[--]</span></div>
                    </div>
                  </div>

                  {/* write authority decision log */}
                  <div>
                    <div className="flex-between">
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Governance Write Authority (Q16)</strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>VP ONLY</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      Policy: **Pending decision**. DB write privileges are revoked for all standard app roles (append-only database triggers logs).
                    </p>
                  </div>

                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* MODAL 1: Confirm Onboarding Clearance */}
      {showClearanceModal && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3 className="dialog-title">Clear Onboarding Clearance — Confirm</h3>
            <p className="dialog-body">
              Provide the audit rationale for clearing this carrier. Doing so removes onboarding blocks and marks them as active for immediate dispatch.
            </p>
            
            <textarea 
              className="dialog-textarea"
              placeholder="Enter vetting decision reason (e.g. CDL, AB5 attested and verified on file)..."
              value={dialogReason}
              onChange={(e) => setDialogReason(e.target.value)}
            />

            <div className="dialog-actions" style={{ marginTop: '1.5rem' }}>
              <button 
                className="action-bar-btn secondary" 
                onClick={() => { setShowClearanceModal(false); setClearanceCarrierId(null); setDialogReason(''); }}
              >
                Cancel
              </button>
              <button 
                className="action-bar-btn"
                disabled={!dialogReason.trim()}
                onClick={submitClearance}
              >
                Clear Vetting Block
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Confirm DNU Block */}
      {showDnuModal && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h3 className="dialog-title" style={{ color: '#f87171' }}>Confirm Placing Carrier on DNU Block</h3>
            <p className="dialog-body">
              This action forces the carrier's dispatch status to RED. Write the official evidentiary reasons to the immutable audit log.
            </p>
            
            <textarea 
              className="dialog-textarea"
              placeholder="State reason for DNU blacklist placement (e.g. Confirmed phone match on double-brokering sweep)..."
              value={dialogReason}
              onChange={(e) => setDialogReason(e.target.value)}
            />

            <div className="dialog-actions" style={{ marginTop: '1.5rem' }}>
              <button 
                className="action-bar-btn secondary" 
                onClick={() => { setShowDnuModal(false); setDnuCarrierId(null); setDialogReason(''); }}
              >
                Cancel
              </button>
              <button 
                className="action-bar-btn"
                style={{ backgroundColor: '#ef4444' }}
                disabled={!dialogReason.trim()}
                onClick={submitDnuBlock}
              >
                Confirm DNU Placement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Design Document Preview Overlay (B10) */}
      {showDocPreview && (
        <div className="dialog-overlay" onClick={() => setShowDocPreview(false)}>
          <div className="dialog-box" style={{ width: '650px', maxWidth: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <h3 className="dialog-title" style={{ margin: 0 }}>📁 Document Preview — {previewDocName}</h3>
              <button className="toggle-btn" onClick={() => setShowDocPreview(false)}>❌</button>
            </div>
            
            {/* Evidentiary Document Mock content details */}
            <div style={{ backgroundColor: '#1e293b', border: '1px solid var(--border-color)', padding: '2rem', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', fontFamily: 'Courier New, monospace', minHeight: '300px', whiteSpace: 'pre-wrap', overflowY: 'auto' }}>
              {previewDocName.includes('coi_') ? (
                `CERTIFICATE OF LIABILITY INSURANCE    DATE: 2026-01-02
------------------------------------------------------
PRODUCER: Lincoln Transport Underwriters
INSURED:  Blue Ridge Freight LLC
          120 Depot St, Savannah, GA 31401
======================================================
COVERAGES:
  * AUTO LIABILITY:  Combined Single Limit
                     $1,000,000  (Active Policy)
  * CARGO INSURANCE: Cargo Aggregate Coverage
                     $100,000    (Active Policy)
  * WORKERS COMP:    Statutory Limits Enforced
                     (Active Policy)
======================================================
This certificate is issued as a matter of information
only and confers no rights upon the certificate holder.
AUTHORIZED REPRESENTATIVE: [Signed]`
              ) : (
                `STANDARD MOTOR CARRIER BROKER-CARRIER AGREEMENT
------------------------------------------------------
This Agreement is entered into by and between
FORREST LOGISTICS INC ("Broker") and the carrier
identified in the accompanying schedule ("Carrier").

TERMS:
1. Carrier agrees to transport shipments at agreed rates.
2. Carrier represents and warrants it meets all federal
   insurance requirements (Auto $1M, Cargo $100K).
3. Under litigation audit rules, this document acts as
   conclusive evidentiary proof of due-diligence.`
              )}
            </div>

            <div className="dialog-actions" style={{ marginTop: '1.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', marginRight: 'auto' }}>
                📁 Presentation design view. SharePoint sync is inactive.
              </span>
              <button className="action-bar-btn" onClick={() => setShowDocPreview(false)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
