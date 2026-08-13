import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Category, Word, UserProgress } from "../types";
import { 
  getDefaultCategories, 
  getAllSubcategoryIds, 
  getCategoryStats, 
  getWordsForCategory,
  ensureBookCategories,
  renderCategoryOptions,
  isCategoryPaused
} from "../categories";
import { POS_DEFAULT, TOPICS_DEFAULT } from "../data";
import { getApiUrl, getApiHeaders, speak, getOfflineClassification, parseImportLine, getWordNextReviewTimeMs, findDuplicateWord } from "../utils";

interface CategoriesScreenProps {
  words: Word[];
  stats: UserProgress;
  onSaveProgress: (stats: UserProgress) => void;
  onSaveWord: (word: Word) => void;
  onSaveWords: (words: Word[]) => void;
  onDeleteWord?: (wordId: string) => void;
  onDeleteWords?: (wordIds: string[]) => void;
  onNavigateHomeWithCategory: (categoryId: string) => void;
  onStartStudyCategory: (categoryId: string, type: "learn" | "review" | "mandatory") => void;
  onBack: () => void;
}

const EMOJI_OPTIONS = ["📁", "🎬", "👨‍🏫", "📚", "💬", "📌", "🎞️", "📖", "✈️", "🍕", "🎮", "🎵", "🏆", "💼", "⭐", "💡"];

export default function CategoriesScreen({
  words,
  stats,
  onSaveProgress,
  onSaveWord,
  onSaveWords,
  onDeleteWord,
  onDeleteWords,
  onNavigateHomeWithCategory,
  onStartStudyCategory,
  onBack
}: CategoriesScreenProps) {
  const userId = stats.userId || "guest";
  const rawCategories: Category[] = stats.categories && stats.categories.length > 0 
    ? stats.categories 
    : getDefaultCategories(userId);
  const categories: Category[] = ensureBookCategories(rawCategories, userId);

  const activeCategoryId = stats.activeCategoryId || "cat_base";

  // Dictionaries
  const deletedTopics = stats.deletedTopics || [];
  const deletedPos = stats.deletedPos || [];

  const allTopics: { [key: string]: string } = {};
  Object.entries(TOPICS_DEFAULT).forEach(([k, v]) => {
    if (!deletedTopics.includes(k)) {
      allTopics[k] = v;
    }
  });
  Object.entries(stats.customTopics || {}).forEach(([k, v]) => {
    allTopics[k] = v;
  });

  const allPos: { [key: string]: string } = {};
  Object.entries(POS_DEFAULT).forEach(([k, v]) => {
    if (!deletedPos.includes(k)) {
      allPos[k] = v;
    }
  });
  Object.entries(stats.customPos || {}).forEach(([k, v]) => {
    allPos[k] = v;
  });

  // Search categories
  const [searchTerm, setSearchTerm] = useState("");

  // Level Navigation State:
  // selectedMainCatId: null = Level 1 (All Main Categories), string = Level 2 (Subcategories Page)
  // selectedSubCatId: null = Level 2, string = Level 3 (Words in Subcategory Page)
  const [selectedMainCatId, setSelectedMainCatId] = useState<string | null>(null);
  const [selectedSubCatId, setSelectedSubCatId] = useState<string | null>(null);

  // Sorting mode for Main Categories (Level 1)
  const [mainSortMode, setMainSortModeState] = useState<"date_desc" | "date_asc" | "alpha_asc" | "alpha_desc">(() => {
    return (localStorage.getItem("journal_sort_main_cat") as any) || "date_asc";
  });

  // Sorting mode for Subcategories (Level 2)
  const [subSortMode, setSubSortModeState] = useState<"date_desc" | "date_asc" | "alpha_asc" | "alpha_desc">(() => {
    return (localStorage.getItem("journal_sort_sub_cat") as any) || "date_asc";
  });

  // Sorting mode for Words (Level 3)
  const [wordSortMode, setWordSortModeState] = useState<"date_desc" | "date_asc" | "alpha_asc" | "alpha_desc" | "status">(() => {
    return (localStorage.getItem("journal_sort_words") as any) || "date_asc";
  });

  const setMainSortMode = (val: "date_desc" | "date_asc" | "alpha_asc" | "alpha_desc") => {
    setMainSortModeState(val);
    localStorage.setItem("journal_sort_main_cat", val);
  };

  const setSubSortMode = (val: "date_desc" | "date_asc" | "alpha_asc" | "alpha_desc") => {
    setSubSortModeState(val);
    localStorage.setItem("journal_sort_sub_cat", val);
  };

  const setWordSortMode = (val: "date_desc" | "date_asc" | "alpha_asc" | "alpha_desc" | "status") => {
    setWordSortModeState(val);
    localStorage.setItem("journal_sort_words", val);
  };

  // Viewing category words modal state
  const [viewCatId, setViewCatId] = useState<string | null>(null);
  const [wordSearchTerm, setWordSearchTerm] = useState("");
  const [wordFilterPos, setWordFilterPos] = useState("all");
  const [wordFilterTopic, setWordFilterTopic] = useState("all");
  const [wordDisplayLimit, setWordDisplayLimit] = useState(50); // Performance optimization: render max 50 at start

  // Editing word state
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [editEn, setEditEn] = useState("");
  const [editRu, setEditRu] = useState("");
  const [editPos, setEditPos] = useState("noun");
  const [editTopic, setEditTopic] = useState("general");
  const [editCatId, setEditCatId] = useState("cat_base");
  const [editNote, setEditNote] = useState("");

  // Adding word state (inside category)
  const [showAddWordModal, setShowAddWordModal] = useState(false);
  const [addSelectedSubCatId, setAddSelectedSubCatId] = useState<string>("");
  const [addEn, setAddEn] = useState("");
  const [addRu, setAddRu] = useState("");
  const [addPos, setAddPos] = useState("noun");
  const [addTopic, setAddTopic] = useState("general");
  const [addNote, setAddNote] = useState("");
  const [isClassifyingAdd, setIsClassifyingAdd] = useState(false);
  const [addMsg, setAddMsg] = useState("");

  // Category Form Modal State (Create / Edit)
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [catIcon, setCatIcon] = useState("📁");
  const [catParentId, setCatParentId] = useState<string | null>(null);

  // Quick Import Modal State
  const [importCatId, setImportCatId] = useState<string | null>(null);
  const [importTargetSubId, setImportTargetSubId] = useState<string>("");
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [parsedImport, setParsedImport] = useState<Array<{ en: string; ru: string; pos: string; topic: string; note: string }>>([]);

  const handleOpenImportModal = (catId: string) => {
    setImportCatId(catId);
    setImportText("");
    setParsedImport([]);
    setImportMsg("");
    const subs = categories.filter(c => c.parentId === catId && !c.archived);
    setImportTargetSubId(subs.length > 0 ? subs[0].id : "");
  };

  // Bulk word selection & delete state
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteWordsConfirm, setShowBulkDeleteWordsConfirm] = useState(false);
  const wordLongPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const toggleWordSelection = (wordId: string) => {
    setSelectedWordIds(prev => {
      const next = new Set(prev);
      if (next.has(wordId)) {
        next.delete(wordId);
      } else {
        next.add(wordId);
      }
      return next;
    });
  };

  const handleTouchStartWord = (wordId: string) => {
    if (wordLongPressTimerRef.current) clearTimeout(wordLongPressTimerRef.current);
    wordLongPressTimerRef.current = setTimeout(() => {
      toggleWordSelection(wordId);
      if (window.navigator && window.navigator.vibrate) {
        try { window.navigator.vibrate(50); } catch (_) {}
      }
    }, 450);
  };

  const handleTouchEndWord = () => {
    if (wordLongPressTimerRef.current) {
      clearTimeout(wordLongPressTimerRef.current);
      wordLongPressTimerRef.current = null;
    }
  };

  // If a main category has NO subcategories, automatically show its direct words directly
  React.useEffect(() => {
    if (selectedMainCatId && !selectedSubCatId) {
      const subCats = categories.filter(c => c.parentId === selectedMainCatId && !c.archived);
      if (subCats.length === 0) {
        setSelectedSubCatId(selectedMainCatId);
      }
    }
  }, [selectedMainCatId, selectedSubCatId, categories]);

  // Scroll to top on mount or navigation between main categories / subcategories
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [selectedMainCatId, selectedSubCatId, viewCatId]);

  // Confirm delete modal state
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null);
  const [deleteSubMode, setDeleteSubMode] = useState<"keep_words" | "all">("keep_words");
  const [deleteDestCatId, setDeleteDestCatId] = useState<string>("");

  // Multi-select state for Main Categories (Level 1)
  const [selectedMainCatIds, setSelectedMainCatIds] = useState<Set<string>>(new Set());
  const mainCatLongPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Multi-select state for Subcategories (Level 2)
  const [selectedSubCatIds, setSelectedSubCatIds] = useState<Set<string>>(new Set());
  const subCatLongPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Bulk delete confirmation modals
  const [showBulkDeleteMainCatsConfirm, setShowBulkDeleteMainCatsConfirm] = useState(false);
  const [showBulkDeleteSubCatsConfirm, setShowBulkDeleteSubCatsConfirm] = useState(false);

  const toggleMainCatSelection = (catId: string) => {
    if (catId === "cat_main" || catId === "cat_base") return;
    setSelectedMainCatIds(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  const handleTouchStartMainCat = (catId: string) => {
    if (catId === "cat_main" || catId === "cat_base") return;
    if (mainCatLongPressTimerRef.current) clearTimeout(mainCatLongPressTimerRef.current);
    mainCatLongPressTimerRef.current = setTimeout(() => {
      toggleMainCatSelection(catId);
      if (window.navigator && window.navigator.vibrate) {
        try { window.navigator.vibrate(50); } catch (_) {}
      }
    }, 450);
  };

  const handleTouchEndMainCat = () => {
    if (mainCatLongPressTimerRef.current) {
      clearTimeout(mainCatLongPressTimerRef.current);
      mainCatLongPressTimerRef.current = null;
    }
  };

  const toggleSubCatSelection = (subId: string) => {
    setSelectedSubCatIds(prev => {
      const next = new Set(prev);
      if (next.has(subId)) next.delete(subId);
      else next.add(subId);
      return next;
    });
  };

  const handleTouchStartSubCat = (subId: string) => {
    if (subCatLongPressTimerRef.current) clearTimeout(subCatLongPressTimerRef.current);
    subCatLongPressTimerRef.current = setTimeout(() => {
      toggleSubCatSelection(subId);
      if (window.navigator && window.navigator.vibrate) {
        try { window.navigator.vibrate(50); } catch (_) {}
      }
    }, 450);
  };

  const handleTouchEndSubCat = () => {
    if (subCatLongPressTimerRef.current) {
      clearTimeout(subCatLongPressTimerRef.current);
      subCatLongPressTimerRef.current = null;
    }
  };

  const handleConfirmBulkDeleteMainCats = () => {
    if (selectedMainCatIds.size === 0) return;

    if (selectedMainCatIds.size === 1) {
      const singleId = Array.from(selectedMainCatIds)[0] as string;
      setSelectedMainCatIds(new Set());
      handleOpenDeleteModal(singleId);
      setShowBulkDeleteMainCatsConfirm(false);
      return;
    }

    const allCatIdsToDelete: string[] = [];
    selectedMainCatIds.forEach(catId => {
      const subIds = getAllSubcategoryIds(catId, categories);
      subIds.forEach(id => {
        if (!allCatIdsToDelete.includes(id)) allCatIdsToDelete.push(id);
      });
    });

    const wordsToDelete = words.filter(w => w.categoryId && allCatIdsToDelete.includes(w.categoryId));

    if (onDeleteWord) {
      wordsToDelete.forEach(w => onDeleteWord(w.id));
    } else {
      const remainingWords = words.filter(w => !w.categoryId || !allCatIdsToDelete.includes(w.categoryId));
      onSaveWords(remainingWords);
    }

    const updatedCats = categories.filter(c => !allCatIdsToDelete.includes(c.id));
    const nextActive = activeCategoryId && allCatIdsToDelete.includes(activeCategoryId) ? "cat_base" : activeCategoryId;

    onSaveProgress({
      ...stats,
      categories: updatedCats,
      activeCategoryId: nextActive
    });

    const count = selectedMainCatIds.size;
    setSelectedMainCatIds(new Set());
    setShowBulkDeleteMainCatsConfirm(false);
    showToast(`🗑️ Удалено категорий: ${count} и ${wordsToDelete.length} слов(а)!`);
  };

  const handleConfirmBulkDeleteSubCats = () => {
    if (selectedSubCatIds.size === 0) return;

    if (selectedSubCatIds.size === 1) {
      const singleId = Array.from(selectedSubCatIds)[0] as string;
      setSelectedSubCatIds(new Set());
      handleOpenDeleteModal(singleId);
      setShowBulkDeleteSubCatsConfirm(false);
      return;
    }

    const subIdsToDelete = Array.from(selectedSubCatIds);
    const wordsToDelete = words.filter(w => w.categoryId && subIdsToDelete.includes(w.categoryId));

    if (onDeleteWord) {
      wordsToDelete.forEach(w => onDeleteWord(w.id));
    } else {
      const remainingWords = words.filter(w => !w.categoryId || !subIdsToDelete.includes(w.categoryId));
      onSaveWords(remainingWords);
    }

    const updatedCats = categories.filter(c => !subIdsToDelete.includes(c.id));
    const nextActive = activeCategoryId && subIdsToDelete.includes(activeCategoryId) ? (selectedMainCatId || "cat_base") : activeCategoryId;

    onSaveProgress({
      ...stats,
      categories: updatedCats,
      activeCategoryId: nextActive
    });

    const count = selectedSubCatIds.size;
    setSelectedSubCatIds(new Set());
    setShowBulkDeleteSubCatsConfirm(false);
    showToast(`🗑️ Удалено подкатегорий: ${count} и ${wordsToDelete.length} слов(а)!`);
  };

  const handleTogglePauseCategory = (catId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updatedCats = categories.map(c => {
      if (c.id === catId) {
        return { ...c, paused: !c.paused };
      }
      return c;
    });
    onSaveProgress({
      ...stats,
      categories: updatedCats
    });
    const targetCat = categories.find(c => c.id === catId);
    const nowPaused = targetCat ? !targetCat.paused : true;
    showToast(nowPaused ? `⏸️ Повторения для «${targetCat?.name}» поставлены на паузу!` : `▶️ Повторения для «${targetCat?.name}» возобновлены!`);
  };

  const handleOpenDeleteModal = (catId: string) => {
    setDeleteCatId(catId);
    const target = categories.find(c => c.id === catId);
    if (target && target.parentId) {
      setDeleteSubMode("keep_words");
      const parentCat = categories.find(c => c.id === target.parentId);
      const siblingSubs = categories.filter(c => c.parentId === target.parentId && c.id !== catId && !c.archived);
      
      if (siblingSubs.length > 0) {
        setDeleteDestCatId(siblingSubs[0].id);
      } else if (parentCat) {
        setDeleteDestCatId(parentCat.id);
      } else {
        setDeleteDestCatId("cat_base");
      }
    }
  };

  // Select/Transfer words from dictionary into category state
  const [showSelectFromDictModal, setShowSelectFromDictModal] = useState(false);
  const [selectDictSearch, setSelectDictSearch] = useState("");
  const [selectDictSelectedIds, setSelectDictSelectedIds] = useState<Set<string>>(new Set());
  const [selectDictLimit, setSelectDictLimit] = useState(40);
  const [targetSubCatId, setTargetSubCatId] = useState<string | null>(null);
  const [wordToDeleteConfirm, setWordToDeleteConfirm] = useState<Word | null>(null);

  // Transfer Words Modal State (Level 2 & Level 3)
  const [showTransferWordsModal, setShowTransferWordsModal] = useState(false);
  const [transferSearch, setTransferSearch] = useState("");
  const [transferSourceCatFilter, setTransferSourceCatFilter] = useState("all");
  const [transferSelectedIds, setTransferSelectedIds] = useState<Set<string>>(new Set());
  const [transferTargetSubId, setTransferTargetSubId] = useState<string>("");

  // Subcategories of currently viewed category
  const subCatsForCurrentView = useMemo(() => {
    if (!viewCatId) return [];
    return categories.filter(c => c.parentId === viewCatId && !c.archived);
  }, [viewCatId, categories]);

  // Candidate words for select-from-dictionary modal (supports subcategories & cross-transfer)
  const candidateWordsForSelect = useMemo(() => {
    if (!viewCatId) return [];
    const currentViewCategory = categories.find(c => c.id === viewCatId);
    if (!currentViewCategory) return [];

    let list = words;

    if (currentViewCategory.parentId) {
      // Subcategory view: allow ONLY words from the SAME parent category family (parent category + its sibling subcategories)
      const parentId = currentViewCategory.parentId;
      const siblingSubCatIds = categories
        .filter(c => c.parentId === parentId && !c.archived)
        .map(c => c.id);
      const familyCatIds = new Set([parentId, ...siblingSubCatIds]);

      list = list.filter(w => 
        w.categoryId && 
        familyCatIds.has(w.categoryId) && 
        w.categoryId !== viewCatId
      );
    } else {
      // Top-level category: allow words from base/main categories, unassigned, or other main categories
      const subCatIds = categories.filter(c => c.parentId === viewCatId).map(c => c.id);
      const myCatIds = new Set([viewCatId, ...subCatIds]);

      list = list.filter(w => !w.categoryId || !myCatIds.has(w.categoryId));
    }

    if (selectDictSearch.trim()) {
      const q = selectDictSearch.trim().toLowerCase();
      list = list.filter(w => w.en.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q));
    }

    return list;
  }, [words, selectDictSearch, viewCatId, categories]);

  const visibleCandidates = useMemo(() => {
    return candidateWordsForSelect.slice(0, selectDictLimit);
  }, [candidateWordsForSelect, selectDictLimit]);

  const handleTransferSelectedWords = () => {
    if (!viewCatId || selectDictSelectedIds.size === 0) return;
    const currentViewCategory = categories.find(c => c.id === viewCatId);
    if (!currentViewCategory) return;

    let destCatId = viewCatId;
    if (!currentViewCategory.parentId && subCatsForCurrentView.length > 0) {
      destCatId = targetSubCatId || subCatsForCurrentView[0].id;
    }

    const destCatObj = categories.find(c => c.id === destCatId);
    const updated = words.map(w => {
      if (selectDictSelectedIds.has(w.id)) {
        return { ...w, categoryId: destCatId };
      }
      return w;
    });

    onSaveWords(updated);
    showToast(`Успешно перенесено ${selectDictSelectedIds.size} слов(а) в подкатегорию «${destCatObj?.name || "категорию"}»!`);
    setShowSelectFromDictModal(false);
    setSelectDictSelectedIds(new Set());
  };

  // Notification toast
  const [toastMsg, setToastMsg] = useState("");

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3500);
  };

  // Open view category modal safely and reset pagination
  const handleOpenViewCategory = (catId: string) => {
    setViewCatId(catId);
    setWordSearchTerm("");
    setWordFilterPos("all");
    setWordFilterTopic("all");
    setWordDisplayLimit(50);
  };

  // Helper to open create modal
  const handleOpenCreateModal = (parentId: string | null = null) => {
    setEditingCatId(null);
    setCatName("");
    setCatIcon(parentId ? "🎞️" : "📁");
    setCatParentId(parentId);
    setShowCatModal(true);
  };

  // Helper to open edit modal
  const handleOpenEditModal = (cat: Category) => {
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatIcon(cat.icon || "📁");
    setCatParentId(cat.parentId);
    setShowCatModal(true);
  };

  // Save / Update Category
  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    let updatedCats = [...categories];

    if (editingCatId) {
      updatedCats = updatedCats.map(c => {
        if (c.id === editingCatId) {
          return {
            ...c,
            name: catName.trim(),
            icon: catIcon,
            parentId: catParentId === editingCatId ? null : catParentId
          };
        }
        return c;
      });
      showToast(`✅ Категория "${catName.trim()}" обновлена!`);
    } else {
      const newCat: Category = {
        id: "cat_" + Math.random().toString(36).slice(2, 9),
        userId,
        name: catName.trim(),
        icon: catIcon,
        parentId: catParentId,
        archived: false,
        created: new Date().toISOString()
      };
      updatedCats.push(newCat);

      if (catParentId) {
        // Check if this is the first subcategory created for this main category
        const existingSubCats = categories.filter(c => c.parentId === catParentId && !c.archived);
        if (existingSubCats.length === 0) {
          const directWords = words.filter(w => w.categoryId === catParentId);
          if (directWords.length > 0) {
            const updatedWords = words.map(w => {
              if (w.categoryId === catParentId) {
                return { ...w, categoryId: newCat.id };
              }
              return w;
            });
            onSaveWords(updatedWords);
            showToast(`✨ Новая подкатегория «${newCat.name}» создана! Все ${directWords.length} слов перенесены в неё.`);
          } else {
            showToast(`✨ Новая подкатегория «${newCat.name}» создана!`);
          }
        } else {
          showToast(`✨ Новая подкатегория «${newCat.name}» создана!`);
        }
        setSelectedMainCatId(catParentId);
        setSelectedSubCatId(newCat.id);
      } else {
        showToast(`✨ Новая категория «${newCat.name}» создана!`);
      }
    }

    onSaveProgress({
      ...stats,
      categories: updatedCats,
      activeCategoryId: activeCategoryId
    });

    setShowCatModal(false);
  };

  // Delete category or subcategory
  const handleConfirmDelete = () => {
    if (!deleteCatId) return;

    const targetCat = categories.find(c => c.id === deleteCatId);
    if (!targetCat) return;

    if (targetCat.parentId) {
      // Subcategory deletion
      const wordsInSub = words.filter(w => w.categoryId === deleteCatId);

      if (deleteSubMode === "all") {
        // PERMANENTLY DELETE all words belonging to this subcategory!
        if (wordsInSub.length > 0) {
          if (onDeleteWord) {
            wordsInSub.forEach(w => onDeleteWord(w.id));
          } else {
            const remainingWords = words.filter(w => w.categoryId !== deleteCatId);
            onSaveWords(remainingWords);
          }
        }

        const updatedCats = categories.filter(c => c.id !== deleteCatId);
        const parentId = targetCat.parentId;
        const nextActive = activeCategoryId === deleteCatId ? parentId : activeCategoryId;

        onSaveProgress({
          ...stats,
          categories: updatedCats,
          activeCategoryId: nextActive
        });

        setDeleteCatId(null);
        showToast(`🗑️ Подкатегория «${targetCat.name}» и ${wordsInSub.length} слов(а) полностью удалены!`);
      } else {
        // MOVE words to selected destination category/subcategory!
        const targetDestId = deleteDestCatId || targetCat.parentId || "cat_base";
        const destCatObj = categories.find(c => c.id === targetDestId);

        if (wordsInSub.length > 0) {
          const movedWords = words.map(w => {
            if (w.categoryId === deleteCatId) {
              return { ...w, categoryId: targetDestId };
            }
            return w;
          });
          onSaveWords(movedWords);
        }

        const updatedCats = categories.filter(c => c.id !== deleteCatId);
        const parentId = targetCat.parentId;
        const nextActive = activeCategoryId === deleteCatId ? parentId : activeCategoryId;

        onSaveProgress({
          ...stats,
          categories: updatedCats,
          activeCategoryId: nextActive
        });

        setDeleteCatId(null);
        showToast(`✨ Подкатегория «${targetCat.name}» удалена. Все ${wordsInSub.length} слов(а) сохранены и перенесены в «${destCatObj?.name || "выбранную категорию"}»!`);
      }
    } else {
      // Main category deletion: PERMANENTLY DELETE all words in this main category & its subcategories!
      const subIds = getAllSubcategoryIds(deleteCatId, categories);
      const wordsToDelete = words.filter(w => w.categoryId && subIds.includes(w.categoryId));

      if (onDeleteWord) {
        wordsToDelete.forEach(w => onDeleteWord(w.id));
      } else {
        const remainingWords = words.filter(w => !w.categoryId || !subIds.includes(w.categoryId));
        onSaveWords(remainingWords);
      }

      const updatedCats = categories.filter(c => !subIds.includes(c.id));
      const nextActive = activeCategoryId && subIds.includes(activeCategoryId) ? "cat_base" : activeCategoryId;

      onSaveProgress({
        ...stats,
        categories: updatedCats,
        activeCategoryId: nextActive
      });

      setDeleteCatId(null);
      showToast(`🗑️ Категория «${targetCat.name}» и ${wordsToDelete.length} слов(а) полностью удалены!`);
    }
  };

  // AI Bulk Import Handler
  const handleRunAiImport = async () => {
    if (!importText.trim() || !importCatId) return;

    setImporting(true);
    setImportMsg("🤖 ИИ анализирует и переводит слова...");
    setParsedImport([]);

    // Split strictly by newlines so commas inside translations don't split rows
    const lines = importText
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setImportMsg("❌ Текст для импорта пуст!");
      setImporting(false);
      return;
    }

    const preParsed = lines.map(line => parseImportLine(line));

    try {
      const res = await fetch(getApiUrl("/api/classify"), {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({
          batch: preParsed.slice(0, 50),
          allPos: allPos,
          allTopics: allTopics
        })
      });

      if (!res.ok) {
        throw new Error("Ошибка бэкенда при импорте");
      }

      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        setParsedImport(data.results);
        setImportMsg(`✨ Распознано ${data.results.length} слов! Проверьте и нажмите «Сохранить»`);
      } else {
        const offlineParsed = preParsed.map(item => {
          const cls = getOfflineClassification(item.en, item.ru, allPos, allTopics);
          return {
            en: item.en,
            ru: item.ru || "—",
            pos: cls.pos || "noun",
            topic: cls.topic || "general",
            note: "Импорт"
          };
        });
        setParsedImport(offlineParsed);
        setImportMsg(`💡 Распознано ${offlineParsed.length} слов`);
      }
    } catch (e) {
      const offlineParsed = preParsed.map(item => {
        const cls = getOfflineClassification(item.en, item.ru, allPos, allTopics);
        return {
          en: item.en,
          ru: item.ru || "—",
          pos: cls.pos || "noun",
          topic: cls.topic || "general",
          note: "Импорт"
        };
      });
      setParsedImport(offlineParsed);
      setImportMsg(`💡 Распознано ${offlineParsed.length} слов`);
    } finally {
      setImporting(false);
    }
  };

  // Save imported words
  const handleSaveImportedWords = () => {
    if (!importCatId || parsedImport.length === 0) return;

    const subCatsForImport = categories.filter(c => c.parentId === importCatId && !c.archived);
    const finalCatId = subCatsForImport.length > 0 
      ? (importTargetSubId || subCatsForImport[0].id)
      : importCatId;
    const targetCatObj = categories.find(c => c.id === finalCatId);

    const newWords: Word[] = [];
    let skippedCount = 0;

    parsedImport.forEach(p => {
      const pos = p.pos || "noun";
      if (findDuplicateWord(p.en, pos, words) || findDuplicateWord(p.en, pos, newWords)) {
        skippedCount++;
        return;
      }

      newWords.push({
        id: "w_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36),
        userId,
        en: p.en,
        ru: p.ru,
        partOfSpeech: pos,
        topic: p.topic || "general",
        note: p.note || (targetCatObj ? `Из категории ${targetCatObj.name}` : ""),
        learned: false,
        learnedDate: null,
        lastReviewed: null,
        correct: 0,
        wrong: 0,
        streak: 0,
        created: new Date().toISOString(),
        categoryId: finalCatId
      });
    });

    if (newWords.length > 0) {
      onSaveWords(newWords);
    }

    if (newWords.length === 0 && skippedCount > 0) {
      showToast(`⚠️ Все ${skippedCount} слов уже есть в словаре (пропущены дубликаты).`);
    } else {
      showToast(`✅ Импортировано ${newWords.length} слов${skippedCount > 0 ? ` (Пропущено дубликатов: ${skippedCount})` : ''} в «${targetCatObj?.name || "категорию"}»!`);
    }

    setImportCatId(null);
    setImportTargetSubId("");
    setImportText("");
    setParsedImport([]);
    setImportMsg("");
  };

  // Start editing a word in category view
  const handleStartEditWord = (w: Word) => {
    setEditingWord(w);
    setEditEn(w.en);
    setEditRu(w.ru);
    setEditPos(w.partOfSpeech || "noun");
    setEditTopic(w.topic || "general");
    setEditCatId(w.categoryId || viewCatId || "cat_base");
    setEditNote(w.note || "");
  };

  // Save edited word
  const handleSaveEditedWord = () => {
    if (!editingWord || !editEn.trim() || !editRu.trim()) return;

    const targetCatObj = categories.find(c => c.id === editCatId);
    const subCats = categories.filter(c => c.parentId === editCatId && !c.archived);
    if (subCats.length > 0) {
      showToast(`⚠️ У категории «${targetCatObj?.name}» есть подкатегории! Выберите конкретную подкатегорию.`);
      return;
    }

    const updated: Word = {
      ...editingWord,
      en: editEn.trim(),
      ru: editRu.trim(),
      partOfSpeech: editPos,
      topic: editTopic,
      categoryId: editCatId,
      note: editNote.trim()
    };

    onSaveWord(updated);
    setEditingWord(null);
    showToast(`✅ Слово «${updated.en}» обновлено!`);
  };

  // Delete word from category
  const handleDeleteWordFromCat = (wordId: string) => {
    if (onDeleteWord) {
      onDeleteWord(wordId);
    } else {
      const updatedWords = words.filter(w => w.id !== wordId);
      onSaveWords(updatedWords);
    }
    showToast("🗑️ Слово удалено из словаря");
  };

  // Toggle learned status for a word right inside category modal!
  const handleToggleLearnedWord = (w: Word) => {
    const newLearned = !w.learned;
    const updated: Word = {
      ...w,
      learned: newLearned,
      learnedDate: newLearned ? new Date().toISOString() : null
    };

    onSaveWord(updated);
    if (newLearned) {
      showToast(`🎉 Слово «${w.en}» отмечено как выученное!`);
    } else {
      showToast(`↩️ Слово «${w.en}» возвращено на изучение`);
    }
  };

  // AI Auto Classify & Translate for Single Word in Category Modal
  const handleAutoClassifyAddWord = async () => {
    const targetEn = addEn.trim();
    if (!targetEn) return;

    setIsClassifyingAdd(true);
    setAddMsg("🤖 ИИ подбирает перевод, тему и часть речи...");

    try {
      let currentRu = addRu.trim();
      
      // 1. Auto translate if Russian translation is missing
      if (!currentRu) {
        try {
          const transRes = await fetch(getApiUrl("/api/translate"), {
            method: "POST",
            headers: getApiHeaders(),
            body: JSON.stringify({ text: targetEn, from: "en", to: "ru" })
          });
          if (transRes.ok) {
            const transData = await transRes.json();
            if (transData.translation) {
              currentRu = transData.translation.trim();
              setAddRu(currentRu);
            }
          }
        } catch (err) {
          console.warn("Translation failed, continuing to classification:", err);
        }
      }

      // 2. Try offline classification first
      const offlineResult = getOfflineClassification(targetEn, currentRu, allPos, allTopics);
      if (offlineResult && !offlineResult.isGuess) {
        if (offlineResult.pos && allPos[offlineResult.pos]) setAddPos(offlineResult.pos);
        if (offlineResult.topic && allTopics[offlineResult.topic]) setAddTopic(offlineResult.topic);
        const posLabel = allPos[offlineResult.pos] || offlineResult.pos;
        const topicLabel = allTopics[offlineResult.topic] || offlineResult.topic;
        setAddMsg(`✨ Автоопределение: ${posLabel}, тема: ${topicLabel}`);
        return;
      }

      // 3. Classify word via API with Gemini
      const res = await fetch(getApiUrl("/api/classify"), {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({
          en: targetEn,
          ru: currentRu,
          existingPos: Object.entries(allPos).map(([k, v]) => `${k}:${v}`).join(", "),
          existingTopics: Object.entries(allTopics).map(([k, v]) => `${k}:${v}`).join(", "),
          allPos,
          allTopics
        })
      });

      if (res.ok) {
        const item = await res.json();
        const finalPos = item.pos || offlineResult?.pos || addPos;
        const finalTopic = item.topic || offlineResult?.topic || addTopic;
        if (finalPos && allPos[finalPos]) setAddPos(finalPos);
        if (finalTopic && allTopics[finalTopic]) setAddTopic(finalTopic);
        if (item.ru && !addRu.trim()) setAddRu(item.ru);
        
        const posLabel = allPos[finalPos] || finalPos;
        const topicLabel = allTopics[finalTopic] || finalTopic;
        setAddMsg(`🤖 ИИ определил: ${posLabel}, тема: ${topicLabel}`);
      } else if (offlineResult) {
        if (offlineResult.pos && allPos[offlineResult.pos]) setAddPos(offlineResult.pos);
        if (offlineResult.topic && allTopics[offlineResult.topic]) setAddTopic(offlineResult.topic);
        const posLabel = allPos[offlineResult.pos] || offlineResult.pos;
        const topicLabel = allTopics[offlineResult.topic] || offlineResult.topic;
        setAddMsg(`✨ Автоопределение: ${posLabel}, тема: ${topicLabel}`);
      }
    } catch (e) {
      console.warn("Classification error:", e);
      if (addEn.trim()) {
        const offlineResult = getOfflineClassification(addEn.trim(), addRu.trim(), allPos, allTopics);
        if (offlineResult.pos && allPos[offlineResult.pos]) setAddPos(offlineResult.pos);
        if (offlineResult.topic && allTopics[offlineResult.topic]) setAddTopic(offlineResult.topic);
        const posLabel = allPos[offlineResult.pos] || offlineResult.pos;
        const topicLabel = allTopics[offlineResult.topic] || offlineResult.topic;
        setAddMsg(`✨ Определено: ${posLabel}, тема: ${topicLabel}`);
      }
    } finally {
      setIsClassifyingAdd(false);
      setTimeout(() => setAddMsg(""), 4500);
    }
  };

  // Add word directly into viewing category or selected subcategory
  const handleAddWordToCurrentCat = () => {
    const activeAddCatId = addSelectedSubCatId || selectedSubCatId || viewCatId || selectedMainCatId || "cat_main";
    if (!addEn.trim() || !addRu.trim() || duplicateAddWord) return;

    const currentCatObj = categories.find(c => c.id === activeAddCatId);
    const subCats = categories.filter(c => c.parentId === activeAddCatId && !c.archived);

    let targetCatId = activeAddCatId;

    if (subCats.length > 0 && activeAddCatId !== addSelectedSubCatId) {
      if (!addSelectedSubCatId) {
        setAddMsg(`⚠️ У категории «${currentCatObj?.name}» есть подкатегории. Выберите конкретную подкатегорию из списка выше!`);
        return;
      }
      targetCatId = addSelectedSubCatId;
    }

    let finalPos = addPos;
    let finalTopic = addTopic;

    if (finalPos === "noun" || finalTopic === "general") {
      const offline = getOfflineClassification(addEn.trim(), addRu.trim(), allPos, allTopics);
      if (finalPos === "noun" && offline.pos) finalPos = offline.pos;
      if (finalTopic === "general" && offline.topic) finalTopic = offline.topic;
    }

    const newWord: Word = {
      id: "w_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36),
      userId,
      en: addEn.trim(),
      ru: addRu.trim(),
      partOfSpeech: finalPos,
      topic: finalTopic,
      note: addNote.trim(),
      learned: false,
      learnedDate: null,
      lastReviewed: null,
      correct: 0,
      wrong: 0,
      streak: 0,
      created: new Date().toISOString(),
      categoryId: targetCatId
    };

    const targetCatObj = categories.find(c => c.id === targetCatId);

    onSaveWord(newWord);
    setShowAddWordModal(false);
    setAddEn("");
    setAddRu("");
    setAddNote("");
    setAddMsg("");
    setAddSelectedSubCatId("");
    showToast(`✨ Слово «${newWord.en}» добавлено в «${targetCatObj?.name || "категорию"}»!`);
  };

  // Duplicate check for adding word (matches English word + part of speech)
  const trimmedAddEn = addEn.trim().toLowerCase();
  const duplicateAddWord = trimmedAddEn
    ? (words || []).find(w => w.en.trim().toLowerCase() === trimmedAddEn && w.partOfSpeech === addPos)
    : null;

  // Filter and sort top level categories
  const topCategories = useMemo(() => {
    let list = categories.filter(c => !c.parentId && !c.archived);

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      if (mainSortMode === "date_desc") {
        const tA = a.created ? new Date(a.created).getTime() : 0;
        const tB = b.created ? new Date(b.created).getTime() : 0;
        return tB - tA;
      } else if (mainSortMode === "date_asc") {
        const tA = a.created ? new Date(a.created).getTime() : 0;
        const tB = b.created ? new Date(b.created).getTime() : 0;
        return tA - tB;
      } else if (mainSortMode === "alpha_asc") {
        return a.name.localeCompare(b.name, "ru");
      } else if (mainSortMode === "alpha_desc") {
        return b.name.localeCompare(a.name, "ru");
      }
      return 0;
    });
  }, [categories, searchTerm, mainSortMode]);

  // Get currently viewed category object and its words
  const currentViewCategory = viewCatId ? categories.find(c => c.id === viewCatId) : null;
  const currentCategoryWords = useMemo(() => {
    if (!viewCatId) return [];
    return getWordsForCategory(words, viewCatId, categories);
  }, [words, viewCatId, categories]);
  
  // Filter words inside viewing category
  const filteredCategoryWords = useMemo(() => {
    return currentCategoryWords.filter(w => {
      if (wordFilterPos !== "all" && w.partOfSpeech !== wordFilterPos) return false;
      if (wordFilterTopic !== "all" && w.topic !== wordFilterTopic) return false;
      if (wordSearchTerm.trim()) {
        const q = wordSearchTerm.toLowerCase();
        return w.en.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q) || (w.note && w.note.toLowerCase().includes(q));
      }
      return true;
    });
  }, [currentCategoryWords, wordFilterPos, wordFilterTopic, wordSearchTerm]);

  // Paginated sliced words for ultra fast rendering of huge categories!
  const visibleCategoryWords = useMemo(() => {
    return filteredCategoryWords.slice(0, wordDisplayLimit);
  }, [filteredCategoryWords, wordDisplayLimit]);

  // Super-fast cached category statistics computation (O(N) single pass over words)
  const categoryStatsMap = useMemo(() => {
    const wordsByCat = new Map<string, Word[]>();
    const existingCatIds = new Set(categories.map(c => c.id));

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      let catId = w.categoryId;
      if (!catId || !existingCatIds.has(catId)) {
        catId = "cat_base";
      }
      let arr = wordsByCat.get(catId);
      if (!arr) {
        arr = [];
        wordsByCat.set(catId, arr);
      }
      arr.push(w);
    }

    const now = new Date();
    const map = new Map<string, { total: number; learned: number; unlearned: number; dueForReview: number; percent: number; catWords: Word[] }>();

    categories.forEach(cat => {
      let catWords: Word[] = [];
      if (cat.id === "cat_main") {
        catWords = words;
      } else {
        const subIds = getAllSubcategoryIds(cat.id, categories);
        for (const sId of subIds) {
          const wList = wordsByCat.get(sId);
          if (wList) {
            catWords.push(...wList);
          }
        }
      }

      const total = catWords.length;
      let learned = 0;
      let dueForReview = 0;
      for (let i = 0; i < total; i++) {
        const w = catWords[i];
        if (w.learned) {
          learned++;
          if (getWordNextReviewTimeMs(w) <= now.getTime()) {
            dueForReview++;
          }
        }
      }
      const unlearned = total - learned;
      const percent = total > 0 ? Math.round((learned / total) * 100) : 0;

      map.set(cat.id, { total, learned, unlearned, dueForReview, percent, catWords });
    });

    return map;
  }, [words, categories]);

  const getCategoryStatsCached = useCallback((catId: string) => {
    const cached = categoryStatsMap.get(catId);
    if (cached) return cached;
    return { total: 0, learned: 0, unlearned: 0, dueForReview: 0, percent: 0, catWords: [] };
  }, [categoryStatsMap]);

  // Selected Main Category Object (Level 2/3)
  const currentMainCategory = useMemo(() => {
    if (!selectedMainCatId) return null;
    return categories.find(c => c.id === selectedMainCatId) || null;
  }, [selectedMainCatId, categories]);

  // Subcategories for selectedMainCatId, sorted according to subSortMode
  const subcategoriesForMainCat = useMemo(() => {
    if (!selectedMainCatId) return [];
    let list = categories.filter(c => c.parentId === selectedMainCatId && !c.archived);

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      if (subSortMode === "date_desc") {
        const tA = a.created ? new Date(a.created).getTime() : 0;
        const tB = b.created ? new Date(b.created).getTime() : 0;
        return tB - tA;
      } else if (subSortMode === "date_asc") {
        const tA = a.created ? new Date(a.created).getTime() : 0;
        const tB = b.created ? new Date(b.created).getTime() : 0;
        return tA - tB;
      } else if (subSortMode === "alpha_asc") {
        return a.name.localeCompare(b.name, "ru");
      } else if (subSortMode === "alpha_desc") {
        return b.name.localeCompare(a.name, "ru");
      }
      return 0;
    });
  }, [selectedMainCatId, categories, searchTerm, subSortMode, getCategoryStatsCached]);

  // Selected Subcategory Object (Level 3)
  const currentSubCategory = useMemo(() => {
    const activeSubId = selectedSubCatId || (selectedMainCatId && subcategoriesForMainCat.length === 0 ? selectedMainCatId : null);
    if (!activeSubId) return null;
    return categories.find(c => c.id === activeSubId) || null;
  }, [selectedSubCatId, selectedMainCatId, subcategoriesForMainCat, categories]);

  // Candidate words for Transfer Words Modal (Level 2 & 3)
  const candidateWordsForTransfer = useMemo(() => {
    if (!showTransferWordsModal) return [];

    let list: Word[] = [];

    if (selectedSubCatId && currentMainCategory) {
      // Level 3: Inside a subcategory -> Words from other subcategories of the SAME main category
      const familySubCats = categories.filter(c => c.parentId === currentMainCategory.id && !c.archived);
      const familyCatIds = new Set([currentMainCategory.id, ...familySubCats.map(c => c.id)]);

      list = words.filter(w => {
        const wordCat = w.categoryId || "cat_base";
        return familyCatIds.has(wordCat) && wordCat !== selectedSubCatId;
      });

      if (transferSourceCatFilter !== "all") {
        list = list.filter(w => (w.categoryId || "cat_base") === transferSourceCatFilter);
      }
    } else if (selectedMainCatId && currentMainCategory) {
      // Level 2: Inside a main category -> Words from OTHER main categories / base categories
      const mySubCatIds = categories.filter(c => c.parentId === selectedMainCatId && !c.archived).map(c => c.id);
      const myFamilyIds = new Set([selectedMainCatId, ...mySubCatIds]);

      list = words.filter(w => {
        const wordCat = w.categoryId || "cat_base";
        return !myFamilyIds.has(wordCat);
      });

      if (transferSourceCatFilter !== "all") {
        const allowedSourceIds = new Set(getAllSubcategoryIds(transferSourceCatFilter, categories));
        list = list.filter(w => allowedSourceIds.has(w.categoryId || "cat_base"));
      }
    }

    if (transferSearch.trim()) {
      const q = transferSearch.trim().toLowerCase();
      list = list.filter(w => w.en.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q));
    }

    return list;
  }, [showTransferWordsModal, selectedSubCatId, selectedMainCatId, currentMainCategory, categories, words, transferSourceCatFilter, transferSearch]);

  const handleExecuteTransferWords = () => {
    if (transferSelectedIds.size === 0) return;

    let destCatId = selectedSubCatId;
    if (!selectedSubCatId) {
      if (subcategoriesForMainCat.length > 0) {
        destCatId = transferTargetSubId || subcategoriesForMainCat[0].id;
      } else if (selectedMainCatId) {
        destCatId = selectedMainCatId;
      }
    }

    if (!destCatId) return;

    const destCatObj = categories.find(c => c.id === destCatId);
    const destName = destCatObj ? destCatObj.name : "выбранную категорию";

    const updated = words.map(w => {
      if (transferSelectedIds.has(w.id)) {
        return { ...w, categoryId: destCatId };
      }
      return w;
    });

    onSaveWords(updated);
    showToast(`Успешно перенесено ${transferSelectedIds.size} слов(а) в «${destName}»!`);
    setShowTransferWordsModal(false);
    setTransferSelectedIds(new Set());
  };

  // Words for selectedSubCatId (uses getWordsForCategory to collect all words in category and its subcategories)
  const wordsForSubCategory = useMemo(() => {
    const activeSubId = selectedSubCatId || (selectedMainCatId && subcategoriesForMainCat.length === 0 ? selectedMainCatId : null);
    if (!activeSubId) return [];
    let list = getWordsForCategory(words, activeSubId, categories);

    if (wordFilterPos !== "all") {
      list = list.filter(w => w.partOfSpeech === wordFilterPos);
    }
    if (wordFilterTopic !== "all") {
      list = list.filter(w => w.topic === wordFilterTopic);
    }
    if (wordSearchTerm.trim()) {
      const q = wordSearchTerm.toLowerCase();
      list = list.filter(w => w.en.toLowerCase().includes(q) || w.ru.toLowerCase().includes(q) || (w.note && w.note.toLowerCase().includes(q)));
    }

    return [...list].sort((a, b) => {
      if (wordSortMode === "date_desc") {
        const tA = a.created ? new Date(a.created).getTime() : 0;
        const tB = b.created ? new Date(b.created).getTime() : 0;
        return tB - tA;
      } else if (wordSortMode === "date_asc") {
        const tA = a.created ? new Date(a.created).getTime() : 0;
        const tB = b.created ? new Date(b.created).getTime() : 0;
        return tA - tB;
      } else if (wordSortMode === "alpha_asc") {
        return a.en.localeCompare(b.en, "en");
      } else if (wordSortMode === "alpha_desc") {
        return b.en.localeCompare(a.en, "en");
      } else if (wordSortMode === "status") {
        if (a.learned === b.learned) return a.en.localeCompare(b.en, "en");
        return a.learned ? 1 : -1;
      }
      return 0;
    });
  }, [selectedSubCatId, words, categories, wordFilterPos, wordFilterTopic, wordSearchTerm, wordSortMode]);

  // Helper to resolve category name
  const getCatName = (catId?: string) => {
    if (!catId) return "Базовый словарь";
    const found = categories.find(c => c.id === catId);
    return found ? `${found.icon || "📁"} ${found.name}` : "Базовый словарь";
  };

  return (
    <div className="fade-in categories-container" style={{ maxWidth: "100%", overflowX: "hidden", boxSizing: "border-box" }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div className="card" style={{ textAlign: "center", marginBottom: 14, padding: "10px 16px", fontSize: 14, color: "var(--sage)", background: "rgba(143,160,128,0.12)", border: "1px solid var(--sage)", borderRadius: 30 }}>
          {toastMsg}
        </div>
      )}

      {/* LEVEL 1: All Main Categories List */}
      {!selectedMainCatId && (
        <div>
          {/* Main Top Header */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
              <button className="back-btn" onClick={onBack} style={{ borderRadius: 30, padding: "8px 0px", marginLeft: "-2px" }}>← Назад</button>
              <h2 className="section-title" style={{ margin: 0, fontSize: "clamp(18px, 5vw, 22px)", fontWeight: 800, color: "var(--charcoal)", textAlign: "center", flex: 1 }}>📁 Все категории</h2>
              <div style={{ width: 70 }}></div>
            </div>
            <button 
              className="btn btn-primary" 
              style={{ fontSize: 13, padding: "10px 18px", borderRadius: 30, fontWeight: 700, width: "100%" }}
              onClick={() => handleOpenCreateModal(null)}
            >
              ➕ Создать категорию
            </button>
          </div>

          {/* Search Input & Sorting Selector */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <input 
              type="text" 
              className="input" 
              placeholder="🔍 Поиск категории..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ flex: 1, minWidth: 200, boxSizing: "border-box", borderRadius: 30, padding: "10px 16px" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", whiteSpace: "nowrap" }}>🔀 Сортировка:</span>
              <select 
                className="input" 
                style={{ fontSize: 12, padding: "8px 12px", borderRadius: 20, minWidth: 160 }}
                value={mainSortMode}
                onChange={e => setMainSortMode(e.target.value as any)}
              >
                <option value="date_desc">🕒 Сначала новые (по дате)</option>
                <option value="date_asc">🕒 Сначала старые (по дате)</option>
                <option value="alpha_asc">🔤 А-Я (по алфавиту)</option>
                <option value="alpha_desc">🔠 Я-А (по алфавиту)</option>
              </select>
            </div>
          </div>

          {/* Sticky selection toolbar for Main Categories */}
          {selectedMainCatIds.size > 0 && (
            <div 
              className="card" 
              style={{ 
                position: "sticky", 
                top: 10, 
                zIndex: 90, 
                padding: "12px 16px", 
                marginBottom: 16, 
                borderRadius: "1.2rem", 
                background: "rgba(188, 71, 73, 0.08)", 
                border: "1.5px solid var(--terracotta)", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "space-between", 
                gap: 10,
                flexWrap: "wrap",
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)"
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--charcoal)" }}>
                Отмечено: <strong style={{ color: "var(--terracotta)" }}>{selectedMainCatIds.size}</strong> из {topCategories.filter(c => c.id !== "cat_main" && c.id !== "cat_base").length}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: "7px 14px", borderRadius: 20, fontWeight: 700 }}
                  onClick={() => {
                    const deletable = topCategories.filter(c => c.id !== "cat_main" && c.id !== "cat_base");
                    if (selectedMainCatIds.size === deletable.length) {
                      setSelectedMainCatIds(new Set());
                    } else {
                      setSelectedMainCatIds(new Set(deletable.map(c => c.id)));
                    }
                  }}
                >
                  {selectedMainCatIds.size === topCategories.filter(c => c.id !== "cat_main" && c.id !== "cat_base").length ? "☐ Снять выбор" : "☑️ Выделить всё"}
                </button>

                <button
                  className="btn btn-primary"
                  style={{ 
                    fontSize: 12, 
                    padding: "8px 16px", 
                    borderRadius: 20, 
                    background: "var(--terracotta)", 
                    borderColor: "var(--terracotta)", 
                    fontWeight: 700 
                  }}
                  onClick={() => {
                    if (selectedMainCatIds.size === 1) {
                      const singleId = Array.from(selectedMainCatIds)[0] as string;
                      setSelectedMainCatIds(new Set());
                      handleOpenDeleteModal(singleId);
                    } else {
                      setShowBulkDeleteMainCatsConfirm(true);
                    }
                  }}
                >
                  🗑️ Удалить выбранные ({selectedMainCatIds.size})
                </button>

                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13, padding: "6px 12px", borderRadius: 20 }}
                  onClick={() => setSelectedMainCatIds(new Set())}
                  title="Снять выбор"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Categories Grid/List */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: "100%" }}>
            {topCategories
              .filter(c => !searchTerm.trim() || c.name.toLowerCase().includes(searchTerm.toLowerCase()))
              .map(topCat => {
                const statsCat = getCategoryStatsCached(topCat.id);
                const subCats = categories.filter(c => c.parentId === topCat.id && !c.archived);
                const isActive = activeCategoryId === topCat.id;
                const isSelected = selectedMainCatIds.has(topCat.id);
                const canDelete = topCat.id !== "cat_main" && topCat.id !== "cat_base";

                return (
                  <div 
                    key={topCat.id} 
                    className="card" 
                    style={{ 
                      borderLeft: isSelected ? "5px solid var(--rose)" : isActive ? "5px solid var(--sage)" : "1px solid var(--border)",
                      padding: "18px",
                      borderRadius: "1.2rem",
                      boxSizing: "border-box",
                      cursor: "pointer",
                      transition: "transform 0.15s ease, box-shadow 0.15s ease",
                      background: isSelected ? "rgba(224,122,95,0.08)" : "var(--card)"
                    }}
                    onTouchStart={() => handleTouchStartMainCat(topCat.id)}
                    onTouchEnd={handleTouchEndMainCat}
                    onMouseDown={() => handleTouchStartMainCat(topCat.id)}
                    onMouseUp={handleTouchEndMainCat}
                    onClick={() => {
                      if (selectedMainCatIds.size > 0) {
                        toggleMainCatSelection(topCat.id);
                        return;
                      }
                      setSelectedMainCatId(topCat.id);
                      if (subCats.length === 0) {
                        setSelectedSubCatId(topCat.id);
                      } else {
                        setSelectedSubCatId(null);
                      }
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {(selectedMainCatIds.size > 0 || isSelected) && canDelete && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleMainCatSelection(topCat.id)}
                              onClick={e => e.stopPropagation()}
                              style={{ width: 18, height: 18, accentColor: "var(--sage)", cursor: "pointer" }}
                            />
                          )}
                          <span className="cat-icon-text" style={{ fontSize: 28 }}>{topCat.icon || "📁"}</span>
                          <h3 className="cat-title-text" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--charcoal)", wordBreak: "break-word" }}>
                            {topCat.name}
                          </h3>
                          {isActive && (
                            <span className="badge badge-green" style={{ fontSize: 10 }}>
                              ✓ Активная
                            </span>
                          )}
                          {topCat.paused && (
                            <span className="badge badge-gray" style={{ fontSize: 10 }}>
                              ⏸️ На паузе
                            </span>
                          )}
                          {subCats.length === 0 && (
                            <span className="badge badge-gray" style={{ fontSize: 10 }}>
                              📖 Без подкатегорий
                            </span>
                          )}
                        </div>

                        <div className="cat-sub-info" style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {subCats.length > 0 ? (
                            <span>📂 Подкатегорий: <strong>{subCats.length}</strong></span>
                          ) : null}
                          <span>📖 Всего слов: <strong>{statsCat.total}</strong></span>
                          <span>✅ Выучено: <strong>{statsCat.percent}%</strong></span>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ height: 6, background: "rgba(0,0,0,0.06)", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
                          <div 
                            style={{ 
                              height: "100%", 
                              width: `${statsCat.percent}%`, 
                              background: "var(--sage)", 
                              borderRadius: 3 
                            }} 
                          />
                        </div>
                      </div>

                      {/* Main Category Card Action Controls */}
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ fontSize: 12, padding: "7px 12px", borderRadius: 30, fontWeight: 600 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateHomeWithCategory(topCat.id);
                          }}
                          title="Сделать активной и учить на главном экране"
                        >
                          🎯 Учить на главном
                        </button>

                        <button 
                          className="btn btn-secondary" 
                          style={{ fontSize: 12, padding: "7px 12px", borderRadius: 30, fontWeight: 600 }}
                          onClick={e => handleTogglePauseCategory(topCat.id, e)}
                          title={topCat.paused ? "Возобновить повторения" : "Поставить повторения на паузу"}
                        >
                          {topCat.paused ? "▶️ Включить" : "⏸️ Пауза"}
                        </button>

                        {subCats.length > 0 && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ fontSize: 12, padding: "7px 12px", borderRadius: 30, fontWeight: 600 }}
                            onClick={() => {
                              setSelectedMainCatId(topCat.id);
                              setSelectedSubCatId(topCat.id);
                            }}
                            title="Просмотреть все слова этой категории"
                          >
                            📖 Все слова ({statsCat.total})
                          </button>
                        )}

                        <button 
                          className="btn btn-secondary" 
                          style={{ fontSize: 12, padding: "7px 12px", borderRadius: 30, fontWeight: 600 }}
                          onClick={() => handleOpenCreateModal(topCat.id)}
                          title="Добавить подкатегорию"
                        >
                          ➕ Подкатегория
                        </button>

                        <button 
                          className="btn btn-secondary" 
                          style={{ fontSize: 13, padding: "8px 12px", borderRadius: 30 }}
                          onClick={() => handleOpenEditModal(topCat)}
                          title="Изменить категорию"
                        >
                          ✏️
                        </button>

                        {canDelete && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ fontSize: 13, padding: "8px 12px", borderRadius: 30, color: "var(--terracotta)" }}
                            onClick={() => handleOpenDeleteModal(topCat.id)}
                            title="Удалить категорию"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* LEVEL 2: Subcategories Page for selectedMainCatId */}
      {selectedMainCatId && !selectedSubCatId && currentMainCategory && subcategoriesForMainCat.length > 0 && (
        <div>
          {/* Header with Back Navigation */}
          <div style={{ marginBottom: 16 }}>
            <button 
              className="back-btn" 
              onClick={() => setSelectedMainCatId(null)}
              style={{ marginBottom: 12, borderRadius: 30, padding: "8px 0px", marginLeft: "-2px" }}
            >
              ← Назад
            </button>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 36 }}>{currentMainCategory.icon || "📁"}</span>
                <div>
                  <h2 style={{ margin: 0, fontSize: "clamp(20px, 5vw, 24px)", fontWeight: 800, color: "var(--charcoal)" }}>
                    {currentMainCategory.name}
                  </h2>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                    {subcategoriesForMainCat.length} подкатегорий • Всего {getCategoryStatsCached(currentMainCategory.id).total} слов
                  </div>
                </div>
              </div>

              {/* Top Right Buttons: Учить на главном & Все слова */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 13, padding: "8px 16px", borderRadius: 30, fontWeight: 600, whiteSpace: "nowrap" }}
                  onClick={() => onNavigateHomeWithCategory(currentMainCategory.id)}
                  title="Сделать активной и учить на главном экране"
                >
                  🎯 Учить на главном
                </button>

                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 13, padding: "8px 16px", borderRadius: 30, fontWeight: 600, whiteSpace: "nowrap" }}
                  onClick={() => setSelectedSubCatId(selectedMainCatId)}
                  title="Просмотреть все слова этой категории"
                >
                  📖 Все слова ({getCategoryStatsCached(currentMainCategory.id).total})
                </button>
              </div>
            </div>
          </div>

          {/* Controls Toolbar for Subcategories Page */}
          <div className="card" style={{ padding: "16px", marginBottom: 20, borderRadius: "1.2rem", background: "var(--sand-light)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Row 1: Action Buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {/* Button: Create Subcategory */}
                <button 
                  className="btn btn-primary" 
                  style={{ fontSize: 13, padding: "9px 16px", borderRadius: 30, fontWeight: 700 }}
                  onClick={() => handleOpenCreateModal(selectedMainCatId)}
                >
                  ➕<span className="btn-label-desktop"> Создать подкатегорию</span>
                </button>

                {/* Button: Import Words */}
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 13, padding: "9px 16px", borderRadius: 30, fontWeight: 600 }}
                  onClick={() => handleOpenImportModal(selectedMainCatId)}
                >
                  📥<span className="btn-label-desktop"> Импортировать слова</span>
                </button>

                {/* Button: Transfer Words */}
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 13, padding: "9px 16px", borderRadius: 30, fontWeight: 600 }}
                  onClick={() => {
                    setTransferSourceCatFilter("all");
                    setTransferSearch("");
                    setTransferSelectedIds(new Set());
                    if (subcategoriesForMainCat.length > 0) {
                      setTransferTargetSubId(subcategoriesForMainCat[0].id);
                    } else {
                      setTransferTargetSubId("");
                    }
                    setShowTransferWordsModal(true);
                  }}
                  title="Перенести слова из другой основной категории"
                >
                  🔀<span className="btn-label-desktop"> Перенести слова</span>
                </button>

                {/* Button: Edit Main Category */}
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 13, padding: "9px 14px", borderRadius: 30, fontWeight: 600 }}
                  onClick={() => handleOpenEditModal(currentMainCategory)}
                  title="Редактировать категорию"
                >
                  ✏️<span className="btn-label-desktop"> Изменить категорию</span>
                </button>
              </div>

              {/* Subcategory Sorting Selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>🔀 Сортировка:</span>
                <select 
                  className="input" 
                  style={{ fontSize: 12, padding: "7px 12px", borderRadius: 20, minWidth: 170 }}
                  value={subSortMode}
                  onChange={e => setSubSortMode(e.target.value as any)}
                >
                  <option value="date_desc">🕒 Сначала новые (по дате)</option>
                  <option value="date_asc">🕒 Сначала старые (по дате)</option>
                  <option value="alpha_asc">🔤 А-Я (по алфавиту)</option>
                  <option value="alpha_desc">🔠 Я-А (по алфавиту)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sticky selection toolbar for Subcategories */}
          {selectedSubCatIds.size > 0 && (
            <div 
              className="card" 
              style={{ 
                position: "sticky", 
                top: 10, 
                zIndex: 90, 
                padding: "12px 16px", 
                marginBottom: 16, 
                borderRadius: "1.2rem", 
                background: "rgba(188, 71, 73, 0.08)", 
                border: "1.5px solid var(--terracotta)", 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "space-between", 
                gap: 10,
                flexWrap: "wrap",
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)"
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--charcoal)" }}>
                Отмечено: <strong style={{ color: "var(--terracotta)" }}>{selectedSubCatIds.size}</strong> из {subcategoriesForMainCat.length}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: "7px 14px", borderRadius: 20, fontWeight: 700 }}
                  onClick={() => {
                    if (selectedSubCatIds.size === subcategoriesForMainCat.length) {
                      setSelectedSubCatIds(new Set());
                    } else {
                      setSelectedSubCatIds(new Set(subcategoriesForMainCat.map(c => c.id)));
                    }
                  }}
                >
                  {selectedSubCatIds.size === subcategoriesForMainCat.length ? "☐ Снять выбор" : "☑️ Выделить всё"}
                </button>

                <button
                  className="btn btn-primary"
                  style={{ 
                    fontSize: 12, 
                    padding: "8px 16px", 
                    borderRadius: 20, 
                    background: "var(--terracotta)", 
                    borderColor: "var(--terracotta)", 
                    fontWeight: 700 
                  }}
                  onClick={() => {
                    if (selectedSubCatIds.size === 1) {
                      const singleId = Array.from(selectedSubCatIds)[0] as string;
                      setSelectedSubCatIds(new Set());
                      handleOpenDeleteModal(singleId);
                    } else {
                      setShowBulkDeleteSubCatsConfirm(true);
                    }
                  }}
                >
                  🗑️ Удалить выбранные ({selectedSubCatIds.size})
                </button>

                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 13, padding: "6px 12px", borderRadius: 20 }}
                  onClick={() => setSelectedSubCatIds(new Set())}
                  title="Снять выбор"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Subcategories Grid */}
          {subcategoriesForMainCat.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "40px 20px", borderRadius: "1.2rem", background: "var(--sand-light)" }}>
              <div style={{ fontSize: 42, marginBottom: 12 }}>📁</div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--charcoal)" }}>В этой категории пока нет подкатегорий</h3>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 18px 0" }}>
                Вы можете создать подкатегорию (например: «1 серия», «Урок 1») или сразу добавить первое слово!
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button 
                  className="btn btn-primary" 
                  style={{ fontSize: 13, padding: "10px 22px", borderRadius: 30, fontWeight: 700 }}
                  onClick={() => handleOpenCreateModal(selectedMainCatId)}
                >
                  📁 Создать подкатегорию
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 13, padding: "10px 22px", borderRadius: 30, fontWeight: 700 }}
                  onClick={() => {
                    setAddEn("");
                    setAddRu("");
                    setAddNote("");
                    setAddSelectedSubCatId(selectedMainCatId);
                    setShowAddWordModal(true);
                  }}
                >
                  ➕ Добавить первое слово
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 13, padding: "10px 22px", borderRadius: 30, fontWeight: 700 }}
                  onClick={() => handleOpenViewCategory(selectedMainCatId)}
                >
                  📖 Просмотреть слова категории
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {subcategoriesForMainCat.map(subCat => {
                const subStats = getCategoryStatsCached(subCat.id);
                const isSubActive = activeCategoryId === subCat.id;
                const isSubSelected = selectedSubCatIds.has(subCat.id);
                const isSubPaused = isCategoryPaused(subCat.id, categories);

                return (
                  <div 
                    key={subCat.id}
                    className="card"
                    style={{
                      border: isSubSelected ? "2px solid var(--rose)" : isSubActive ? "2px solid var(--sage)" : "1px solid var(--border)",
                      borderRadius: "1.2rem",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 12,
                      cursor: "pointer",
                      background: isSubSelected ? "rgba(224,122,95,0.08)" : isSubActive ? "rgba(143,160,128,0.12)" : "var(--card)",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
                    }}
                    onTouchStart={() => handleTouchStartSubCat(subCat.id)}
                    onTouchEnd={handleTouchEndSubCat}
                    onMouseDown={() => handleTouchStartSubCat(subCat.id)}
                    onMouseUp={handleTouchEndSubCat}
                    onClick={() => {
                      if (selectedSubCatIds.size > 0) {
                        toggleSubCatSelection(subCat.id);
                        return;
                      }
                      setSelectedSubCatId(subCat.id);
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {(selectedSubCatIds.size > 0 || isSubSelected) && (
                            <input
                              type="checkbox"
                              checked={isSubSelected}
                              onChange={() => toggleSubCatSelection(subCat.id)}
                              onClick={e => e.stopPropagation()}
                              style={{ width: 18, height: 18, accentColor: "var(--sage)", cursor: "pointer" }}
                            />
                          )}
                          <span className="subcat-icon-text" style={{ fontSize: 24 }}>{subCat.icon || "🎞️"}</span>
                          <h4 className="subcat-title-text" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--charcoal)", wordBreak: "break-word" }}>
                            {subCat.name}
                          </h4>
                        </div>

                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          {isSubActive && (
                            <span className="badge badge-green" style={{ fontSize: 10 }}>
                              Активна
                            </span>
                          )}
                          {isSubPaused && (
                            <span className="badge badge-gray" style={{ fontSize: 10 }}>
                              ⏸️ На паузе
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="cat-sub-info" style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>
                        <strong>{subStats.total}</strong> слов • {subStats.learned} выучено ({subStats.percent}%)
                        {subStats.dueForReview > 0 && !isSubPaused && (
                          <span style={{ color: "var(--terracotta)", fontWeight: 600, marginLeft: 6 }}>
                            • {subStats.dueForReview} к повторению
                          </span>
                        )}
                      </div>

                      {/* Subcategory Progress Bar - Full Width Above Buttons */}
                      <div style={{ height: 7, background: "rgba(0,0,0,0.08)", borderRadius: 4, marginTop: 10, overflow: "hidden", width: "100%" }}>
                        <div style={{ height: "100%", width: `${subStats.percent}%`, background: "var(--sage)", borderRadius: 4, transition: "width 0.3s ease" }} />
                      </div>
                    </div>

                    {/* Subcategory Action Buttons Below Progress Bar */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 12 }} onClick={e => e.stopPropagation()}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ fontSize: 12, padding: "6px 12px", borderRadius: 30, fontWeight: 600 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigateHomeWithCategory(subCat.id);
                        }}
                        title="Сделать активной и учить на главном экране"
                      >
                        🎯 Учить на главном
                      </button>

                      <button 
                        className="btn btn-secondary" 
                        style={{ fontSize: 12, padding: "6px 10px", borderRadius: 30 }}
                        onClick={e => handleTogglePauseCategory(subCat.id, e)}
                        title={subCat.paused ? "Возобновить повторения" : "Поставить повторения на паузу"}
                      >
                        {subCat.paused ? "▶️ Включить" : "⏸️ Пауза"}
                      </button>

                      <button 
                        className="btn btn-secondary" 
                        style={{ fontSize: 12, padding: "6px 10px", borderRadius: 30 }}
                        onClick={() => handleOpenEditModal(subCat)}
                        title="Изменить название"
                      >
                        ✏️
                      </button>

                      <button 
                        className="btn btn-secondary" 
                        style={{ fontSize: 12, padding: "6px 10px", borderRadius: 30, color: "var(--terracotta)" }}
                        onClick={() => handleOpenDeleteModal(subCat.id)}
                        title="Удалить подкатегорию"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* LEVEL 3: Words inside selectedSubCatId Page */}
      {selectedMainCatId && (selectedSubCatId || subcategoriesForMainCat.length === 0) && currentSubCategory && (
        <div>
          {/* Header with Navigation */}
          <div style={{ marginBottom: 16 }}>
            <button 
              className="back-btn" 
              onClick={() => {
                if (selectedSubCatId && selectedSubCatId !== selectedMainCatId && subcategoriesForMainCat.length > 0) {
                  setSelectedSubCatId(null);
                } else {
                  setSelectedMainCatId(null);
                  setSelectedSubCatId(null);
                }
              }}
              style={{ marginBottom: 12, borderRadius: 30, padding: "8px 0px", marginLeft: "-2px", fontWeight: 700 }}
            >
              ← Назад
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 36 }}>{currentSubCategory.icon || "🎞️"}</span>
              <div>
                <h2 style={{ margin: 0, fontSize: "clamp(20px, 5vw, 24px)", fontWeight: 800, color: "var(--charcoal)" }}>
                  {currentSubCategory.name}
                </h2>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                  {selectedSubCatId === selectedMainCatId 
                    ? `Основная категория • Всего слов: ${wordsForSubCategory.length}`
                    : `Категория: ${currentMainCategory?.name} • Слов в серии: ${wordsForSubCategory.length}`}
                </div>
              </div>
            </div>
          </div>

          {/* Controls Toolbar for Subcategory Words Page */}
          <div className="card" style={{ padding: "16px", marginBottom: 18, borderRadius: "1.2rem", background: "var(--sand-light)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Row 1: Action Buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {/* Button: Create Subcategory in current category */}
                {selectedMainCatId && !categories.find(c => c.id === (selectedSubCatId || selectedMainCatId))?.parentId && (
                  <button 
                    className="btn btn-primary" 
                    style={{ fontSize: 13, padding: "9px 16px", borderRadius: 30, fontWeight: 700 }}
                    onClick={() => handleOpenCreateModal(selectedMainCatId)}
                  >
                    📂<span className="btn-label-desktop"> Добавить подкатегорию</span>
                  </button>
                )}

                {/* Button: Add Word */}
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 13, padding: "9px 16px", borderRadius: 30, fontWeight: 700 }}
                  onClick={() => {
                    setAddEn("");
                    setAddRu("");
                    setAddNote("");
                    setAddPos("noun");
                    setAddTopic("general");
                    setAddMsg("");
                    setAddSelectedSubCatId(selectedSubCatId || selectedMainCatId || "");
                    setShowAddWordModal(true);
                  }}
                >
                  ➕<span className="btn-label-desktop"> Добавить слово</span>
                </button>

                {/* Button: Import Words */}
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 13, padding: "9px 16px", borderRadius: 30, fontWeight: 600 }}
                  onClick={() => {
                    setImportCatId(selectedSubCatId);
                    setImportTargetSubId(selectedSubCatId);
                    setImportText("");
                    setParsedImport([]);
                    setImportMsg("");
                  }}
                >
                  📥<span className="btn-label-desktop"> Импортировать слова</span>
                </button>

                {/* Button: Transfer Words */}
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 13, padding: "9px 16px", borderRadius: 30, fontWeight: 600 }}
                  onClick={() => {
                    setTransferSourceCatFilter("all");
                    setTransferSearch("");
                    setTransferSelectedIds(new Set());
                    setTransferTargetSubId(selectedSubCatId);
                    setShowTransferWordsModal(true);
                  }}
                  title="Перенести слова из других подкатегорий"
                >
                  🔀<span className="btn-label-desktop"> Перенести слова</span>
                </button>

                {/* Button: Study on Main */}
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 13, padding: "9px 16px", borderRadius: 30, fontWeight: 600 }}
                  onClick={() => onNavigateHomeWithCategory(selectedSubCatId)}
                >
                  🎯<span className="btn-label-desktop"> Учить на главном</span>
                </button>
              </div>

              {/* Word Sorting Selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>🔀 Сортировка слов:</span>
                <select 
                  className="input" 
                  style={{ fontSize: 12, padding: "7px 12px", borderRadius: 20, minWidth: 170 }}
                  value={wordSortMode}
                  onChange={e => setWordSortMode(e.target.value as any)}
                >
                  <option value="date_desc">🕒 Сначала новые (по дате)</option>
                  <option value="date_asc">🕒 Сначала старые (по дате)</option>
                  <option value="alpha_asc">🔤 А-Я (по алфавиту)</option>
                  <option value="alpha_desc">🔠 Я-А (по алфавиту)</option>
                  <option value="status">🎯 Сначала на изучении</option>
                </select>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <input 
                type="text" 
                className="input" 
                placeholder={selectedSubCatId === selectedMainCatId ? "🔍 Поиск слова в этой категории..." : "🔍 Поиск слова в этой подкатегории..."} 
                value={wordSearchTerm}
                onChange={e => setWordSearchTerm(e.target.value)}
                style={{ flex: "2 1 200px", fontSize: 12, borderRadius: 20, padding: "8px 14px" }}
              />

              <select 
                className="input" 
                style={{ flex: "1 1 130px", fontSize: 12, borderRadius: 20 }}
                value={wordFilterPos}
                onChange={e => setWordFilterPos(e.target.value)}
              >
                <option value="all">🏷️ Все части речи</option>
                {Object.entries(allPos).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>

              <select 
                className="input" 
                style={{ flex: "1 1 130px", fontSize: 12, borderRadius: 20 }}
                value={wordFilterTopic}
                onChange={e => setWordFilterTopic(e.target.value)}
              >
                <option value="all">🌐 Все темы</option>
                {Object.entries(allTopics).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Words Cards List */}
          {wordsForSubCategory.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "36px 20px", borderRadius: "1.2rem", background: "var(--sand-light)" }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>📂</div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--charcoal)" }}>
                {selectedSubCatId && selectedSubCatId !== selectedMainCatId ? "В этой подкатегории пока нет слов" : "В этой категории пока ничего нет"}
              </h3>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: "8px 0 20px 0", maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
                {selectedSubCatId && selectedSubCatId !== selectedMainCatId 
                  ? "Нажмите «Добавить слово» или «Импортировать слова», чтобы наполнить данную подкатегорию!" 
                  : "Выберите, с чего хотите начать: создать структуру из подкатегорий (например, «Урок 1», «Серия 1») или сразу добавить слова напрямую в категорию?"}
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                {selectedMainCatId && !categories.find(c => c.id === (selectedSubCatId || selectedMainCatId))?.parentId && (
                  <button 
                    className="btn btn-primary" 
                    style={{ fontSize: 13, padding: "11px 22px", borderRadius: 30, fontWeight: 700 }}
                    onClick={() => handleOpenCreateModal(selectedMainCatId)}
                  >
                    📂 Создать подкатегорию
                  </button>
                )}
                <button 
                  className={selectedMainCatId && !categories.find(c => c.id === (selectedSubCatId || selectedMainCatId))?.parentId ? "btn btn-secondary" : "btn btn-primary"} 
                  style={{ fontSize: 13, padding: "11px 22px", borderRadius: 30, fontWeight: 700 }}
                  onClick={() => {
                    setAddEn("");
                    setAddRu("");
                    setAddNote("");
                    setAddSelectedSubCatId(selectedSubCatId || selectedMainCatId || "");
                    setShowAddWordModal(true);
                  }}
                >
                  ➕ Добавить слово
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Selection Control Bar for Bulk Delete */}
              {selectedWordIds.size > 0 && (
                <div 
                  className="card" 
                  style={{ 
                    padding: "12px 16px", 
                    marginBottom: 10, 
                    background: "rgba(188, 71, 73, 0.08)", 
                    border: "1.5px solid var(--terracotta)", 
                    borderRadius: "1.2rem", 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between", 
                    flexWrap: "wrap", 
                    gap: 10 
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ fontSize: 12, padding: "7px 14px", borderRadius: 20, fontWeight: 700 }}
                      onClick={() => {
                        const currentIds = wordsForSubCategory.map(w => w.id);
                        const isAllSelected = currentIds.length > 0 && currentIds.every(id => selectedWordIds.has(id));
                        if (isAllSelected) {
                          setSelectedWordIds(new Set());
                        } else {
                          setSelectedWordIds(new Set(currentIds));
                        }
                      }}
                    >
                      {wordsForSubCategory.length > 0 && wordsForSubCategory.every(w => selectedWordIds.has(w.id)) ? "☐ Снять выбор" : "☑️ Выделить всё"}
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--charcoal)" }}>
                      Отмечено: <strong style={{ color: "var(--terracotta)" }}>{selectedWordIds.size}</strong> из {wordsForSubCategory.length}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button 
                      className="btn btn-primary" 
                      style={{ 
                        fontSize: 12, 
                        padding: "8px 16px", 
                        borderRadius: 20, 
                        background: "var(--terracotta)", 
                        borderColor: "var(--terracotta)", 
                        fontWeight: 700 
                      }}
                      onClick={() => setShowBulkDeleteWordsConfirm(true)}
                    >
                      🗑️ Удалить выбранные ({selectedWordIds.size})
                    </button>
                    <button 
                      className="btn btn-ghost" 
                      style={{ fontSize: 13, padding: "6px 12px", borderRadius: 20 }}
                      onClick={() => setSelectedWordIds(new Set())}
                      title="Снять выбор"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {wordsForSubCategory.slice(0, wordDisplayLimit).map(w => {
                const posName = allPos[w.partOfSpeech] || w.partOfSpeech;
                const topicName = allTopics[w.topic] || w.topic;
                const isSelected = selectedWordIds.has(w.id);

                return (
                  <div 
                    key={w.id} 
                    className="card"
                    style={{ 
                      borderRadius: "1rem", 
                      padding: "14px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      background: isSelected ? "rgba(188, 71, 73, 0.05)" : "var(--card)",
                      border: isSelected ? "2px solid var(--terracotta)" : "1px solid var(--border)",
                      transition: "border 0.15s ease, background 0.15s ease",
                      cursor: selectedWordIds.size > 0 ? "pointer" : "default"
                    }}
                    onClick={() => {
                      if (selectedWordIds.size > 0) {
                        toggleWordSelection(w.id);
                      }
                    }}
                    onTouchStart={() => handleTouchStartWord(w.id)}
                    onTouchEnd={handleTouchEndWord}
                    onMouseDown={() => handleTouchStartWord(w.id)}
                    onMouseUp={handleTouchEndWord}
                    onMouseLeave={handleTouchEndWord}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 200, display: "flex", alignItems: "flex-start", gap: 10 }}>
                        {selectedWordIds.size > 0 && (
                          <button 
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: "2px", lineHeight: 1, marginTop: 1 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWordSelection(w.id);
                            }}
                            title={isSelected ? "Снять выбор" : "Выделить слово"}
                          >
                            {isSelected ? "☑️" : "☐"}
                          </button>
                        )}

                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 17, fontWeight: 800, color: "var(--charcoal)" }}>
                              {w.en}
                            </span>
                            <button 
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 0 }}
                              onClick={(e) => { e.stopPropagation(); speak(w.en); }}
                              title="Прослушать произношение"
                            >
                              🔊
                            </button>
                            <span style={{ color: "var(--terracotta)", fontWeight: 700, fontSize: 15 }}>
                              ➔ {w.ru}
                            </span>
                          </div>

                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                            <span className="badge badge-gray" style={{ fontSize: 10 }}>{posName}</span>
                            <span className="badge badge-gray" style={{ fontSize: 10 }}>{topicName}</span>
                            {w.learned ? (
                              <span className="badge badge-green" style={{ fontSize: 10 }}>✅ Выучено</span>
                            ) : (
                              <span style={{ fontSize: 11, color: "var(--muted)" }}>⏳ На изучении</span>
                            )}
                          </div>

                          {w.note && (
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>
                              📝 {w.note}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Word Card Actions */}
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ 
                            fontSize: 11, 
                            padding: "6px 14px", 
                            borderRadius: 30,
                            background: w.learned ? "rgba(143,160,128,0.15)" : "var(--sage)", 
                            color: w.learned ? "var(--sage)" : "#fff",
                            fontWeight: 700 
                          }}
                          onClick={() => handleToggleLearnedWord(w)}
                        >
                          {w.learned ? "↩️ На изучение" : "✓ Знаю слово"}
                        </button>

                        <button 
                          className="btn btn-secondary" 
                          style={{ fontSize: 12, padding: "6px 12px", borderRadius: 30 }}
                          onClick={() => handleStartEditWord(w)}
                          title="Изменить слово"
                        >
                          ✏️
                        </button>
                        
                        <button 
                          className="btn btn-secondary" 
                          style={{ fontSize: 12, padding: "6px 12px", borderRadius: 30, color: "var(--terracotta)" }}
                          onClick={() => setWordToDeleteConfirm(w)}
                          title="Удалить слово"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Load More Pagination controls */}
              {wordsForSubCategory.length > wordDisplayLimit && (
                <div 
                  className="card"
                  style={{ 
                    marginTop: 14, 
                    padding: "20px 16px", 
                    background: "var(--sand-light)", 
                    borderRadius: "1.2rem", 
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                    border: "1px dashed var(--border)"
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--charcoal)" }}>
                    📊 Показано {Math.min(wordDisplayLimit, wordsForSubCategory.length)} из {wordsForSubCategory.length} слов
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                    <button 
                      className="btn btn-primary"
                      style={{ fontSize: 13, padding: "10px 22px", borderRadius: 30, fontWeight: 700 }}
                      onClick={() => setWordDisplayLimit(prev => prev + 100)}
                    >
                      ➕ Показать ещё (+100 слов)
                    </button>
                    <button 
                      className="btn btn-secondary"
                      style={{ fontSize: 13, padding: "10px 22px", borderRadius: 30, fontWeight: 700, background: "var(--sage)", color: "#fff" }}
                      onClick={() => setWordDisplayLimit(wordsForSubCategory.length)}
                    >
                      ⚡ Показать ВСЕ ({wordsForSubCategory.length}) слов
                    </button>
                  </div>
                </div>
              )}

              {wordsForSubCategory.length <= wordDisplayLimit && wordsForSubCategory.length > 30 && (
                <div style={{ textAlign: "center", padding: "12px", fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                  ✅ Отображаются все {wordsForSubCategory.length} слов данной категории
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal / Drawer: View and Edit Category Words */}
      {viewCatId && currentViewCategory && (
        <div className="overlay" onClick={() => setViewCatId(null)}>
          <div 
            className="card overlay-card" 
            onClick={e => e.stopPropagation()} 
            style={{ 
              maxWidth: 680, 
              width: "96%", 
              maxHeight: "92vh", 
              overflowY: "auto", 
              padding: "20px 16px",
              borderRadius: "1.5rem",
              boxSizing: "border-box"
            }}
          >
            {/* View Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 24 }}>{currentViewCategory.icon || "📁"}</span>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--charcoal)", wordBreak: "break-word" }}>
                    {currentViewCategory.name}
                  </h3>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  Всего слов в категории: <strong>{currentCategoryWords.length}</strong>
                </div>
              </div>

              <button 
                className="btn btn-secondary" 
                style={{ fontSize: 16, padding: "4px 10px", borderRadius: "50%", minWidth: 36, height: 36 }}
                onClick={() => setViewCatId(null)}
              >
                ✕
              </button>
            </div>

            {/* Quick Actions in View */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <button 
                className="btn btn-primary" 
                style={{ fontSize: 12, padding: "8px 14px", flex: "1 1 auto" }}
                onClick={() => {
                  setAddEn("");
                  setAddRu("");
                  setAddNote("");
                  setAddPos("noun");
                  setAddTopic("general");
                  setAddMsg("");
                  setAddSelectedSubCatId("");
                  setShowAddWordModal(true);
                }}
              >
                ➕ Новое слово
              </button>

              {!currentViewCategory.parentId && (
                <button 
                  className="btn btn-secondary" 
                  style={{ fontSize: 12, padding: "8px 14px", flex: "1 1 auto", background: "rgba(188,71,73,0.12)", color: "var(--terracotta)", fontWeight: 700 }}
                  onClick={() => {
                    handleOpenCreateModal(currentViewCategory.id);
                  }}
                >
                  📂 Добавить подкатегорию
                </button>
              )}

              {viewCatId !== "cat_main" && (
                <button 
                  className="btn btn-secondary" 
                  style={{ 
                    fontSize: 12, 
                    padding: "8px 14px", 
                    flex: "1 1 auto", 
                    background: "rgba(143,160,128,0.18)", 
                    color: "var(--sage)", 
                    border: "1px solid var(--sage)",
                    fontWeight: 600
                  }}
                  onClick={() => {
                    setSelectDictSearch("");
                    setSelectDictSelectedIds(new Set());
                    setSelectDictLimit(40);
                    setShowSelectFromDictModal(true);
                  }}
                >
                  📥 Выбрать из словаря
                </button>
              )}

              <button 
                className="btn btn-secondary" 
                style={{ fontSize: 12, padding: "8px 14px", flex: "1 1 auto" }}
                onClick={() => {
                  onNavigateHomeWithCategory(currentViewCategory.id);
                  setViewCatId(null);
                }}
              >
                🎯 Учить на главном
              </button>
            </div>

            {/* Filters for words in category */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              <input 
                type="text" 
                className="input" 
                placeholder="🔍 Поиск слова в этой категории..." 
                value={wordSearchTerm}
                onChange={e => {
                  setWordSearchTerm(e.target.value);
                  setWordDisplayLimit(50);
                }}
                style={{ width: "100%", boxSizing: "border-box" }}
              />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select 
                  className="input" 
                  style={{ flex: 1, minWidth: 130, fontSize: 12 }}
                  value={wordFilterPos}
                  onChange={e => {
                    setWordFilterPos(e.target.value);
                    setWordDisplayLimit(50);
                  }}
                >
                  <option value="all">🏷️ Все части речи</option>
                  {Object.entries(allPos).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>

                <select 
                  className="input" 
                  style={{ flex: 1, minWidth: 130, fontSize: 12 }}
                  value={wordFilterTopic}
                  onChange={e => {
                    setWordFilterTopic(e.target.value);
                    setWordDisplayLimit(50);
                  }}
                >
                  <option value="all">🌐 Все темы</option>
                  {Object.entries(allTopics).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Words List with instant rendering */}
            {filteredCategoryWords.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 10px", color: "var(--muted)", background: "var(--sand-light)", borderRadius: 12, border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>В этой категории нет подходящих слов</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Нажмите «Добавить слово», чтобы занести новые выражения</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleCategoryWords.map(w => {
                  const posName = allPos[w.partOfSpeech] || w.partOfSpeech;
                  const topicName = allTopics[w.topic] || w.topic;

                  return (
                    <div 
                      key={w.id} 
                      style={{ 
                        background: "var(--sand-light)", 
                        border: "1px solid var(--border)", 
                        borderRadius: 12, 
                        padding: "12px 14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        boxShadow: "0 1px 4px rgba(0,0,0,0.02)"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--charcoal)" }}>
                              {w.en}
                            </span>
                            <button 
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: 0 }}
                              onClick={() => speak(w.en)}
                              title="Прослушать произношение"
                            >
                              🔊
                            </button>
                            <span style={{ color: "var(--terracotta)", fontWeight: 600, fontSize: 14 }}>
                              ➔ {w.ru}
                            </span>
                          </div>

                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                            <span className="badge badge-gray" style={{ fontSize: 10 }}>
                              {posName}
                            </span>
                            <span className="badge badge-gray" style={{ fontSize: 10 }}>
                              {topicName}
                            </span>
                            {w.learned ? (
                              <span className="badge badge-green" style={{ fontSize: 10 }}>
                                ✅ Выучено
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: "var(--muted)" }}>
                                ⏳ На повторение
                              </span>
                            )}
                          </div>

                          {w.note && (
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>
                              📝 {w.note}
                            </div>
                          )}
                        </div>

                        {/* Word Action Buttons: Toggle learned status + Edit + Delete */}
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ 
                              fontSize: 11, 
                              padding: "6px 10px", 
                              background: w.learned ? "rgba(143,160,128,0.15)" : "var(--sage)", 
                              color: w.learned ? "var(--sage)" : "#fff",
                              fontWeight: 600 
                            }}
                            onClick={() => handleToggleLearnedWord(w)}
                            title={w.learned ? "Вернуть слово на изучение" : "Отметить как выученное"}
                          >
                            {w.learned ? "↩️ На изучение" : "✓ Знаю слово"}
                          </button>

                          <button 
                            className="btn btn-secondary" 
                            style={{ fontSize: 12, padding: "5px 8px" }}
                            onClick={() => handleStartEditWord(w)}
                            title="Изменить слово"
                          >
                            ✏️
                          </button>
                          
                          <button 
                            className="btn btn-secondary" 
                            style={{ fontSize: 12, padding: "5px 8px", color: "var(--terracotta)" }}
                            onClick={() => setWordToDeleteConfirm(w)}
                            title="Удалить слово"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Show Load More Button if filtered list has more items */}
                {filteredCategoryWords.length > visibleCategoryWords.length && (
                  <div style={{ textAlign: "center", marginTop: 12 }}>
                    <button 
                      className="btn btn-secondary" 
                      style={{ fontSize: 13, padding: "10px 20px", borderRadius: 20, fontWeight: 600 }}
                      onClick={() => setWordDisplayLimit(prev => prev + 100)}
                    >
                      👇 Показать ещё (показано {visibleCategoryWords.length} из {filteredCategoryWords.length})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Edit Word */}
      {editingWord && (
        <div className="overlay" onClick={() => setEditingWord(null)}>
          <div className="card overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3 className="section-title">✏️ Редактировать слово</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Слово / Фраза на английском
                </label>
                <input 
                  type="text" 
                  className="input" 
                  value={editEn} 
                  onChange={e => setEditEn(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Перевод на русский
                </label>
                <input 
                  type="text" 
                  className="input" 
                  value={editRu} 
                  onChange={e => setEditRu(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Часть речи
                </label>
                <select className="input" value={editPos} onChange={e => setEditPos(e.target.value)}>
                  {Object.entries(allPos).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Тема
                </label>
                <select className="input" value={editTopic} onChange={e => setEditTopic(e.target.value)}>
                  {Object.entries(allTopics).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Категория / Папка
                </label>
                <select className="input" value={editCatId} onChange={e => setEditCatId(e.target.value)}>
                  {renderCategoryOptions(categories)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Заметка / Пример
                </label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Например: Из контекста..."
                  value={editNote} 
                  onChange={e => setEditNote(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1, padding: 10 }} onClick={handleSaveEditedWord}>
                  Сохранить изменения
                </button>
                <button className="btn btn-secondary" style={{ flex: 1, padding: 10 }} onClick={() => setEditingWord(null)}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add New Word into Category with Smart AI Auto-Classify & Duplicate Warning */}
      {showAddWordModal && (() => {
        const activeAddCatId = addSelectedSubCatId || selectedSubCatId || viewCatId || selectedMainCatId || "cat_main";
        const currentViewCategory = categories.find(c => c.id === activeAddCatId);
        const subCatsForCurrentView = categories.filter(c => c.parentId === activeAddCatId && !c.archived);

        return (
          <div className="overlay" onClick={() => setShowAddWordModal(false)} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div 
              className="card overlay-card" 
              onClick={e => e.stopPropagation()} 
              style={{ 
                maxWidth: 440, 
                width: "100%", 
                maxHeight: "88vh", 
                display: "flex", 
                flexDirection: "column", 
                padding: "20px",
                background: "var(--card)",
                overflow: "hidden"
              }}
            >
              <h3 className="section-title" style={{ flexShrink: 0, marginBottom: 12 }}>
                ➕ Добавить слово в «{currentViewCategory?.name}»
              </h3>

              {/* Scrollable form body */}
              <div className="styled-scrollbar-y" style={{ flex: 1, overflowY: "auto", paddingRight: 4, display: "flex", flexDirection: "column", gap: 12 }}>
                {subCatsForCurrentView.length > 0 && !addSelectedSubCatId && (
                  <div style={{ padding: "10px 12px", background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.4)", borderRadius: 12, fontSize: 12, color: "var(--charcoal)", lineHeight: 1.4 }}>
                    ⚠️ <strong>Внимание:</strong> В этой категории есть подкатегории! Вы должны выбрать конкретную подкатегорию, в которую нужно добавить слово (напрямую в категорию без указания подкатегории добавить нельзя).
                  </div>
                )}

                {/* Duplicate warning notification */}
                {duplicateAddWord && (
                  <div style={{ padding: "10px 12px", background: "rgba(245, 158, 11, 0.15)", border: "1px solid rgba(245, 158, 11, 0.4)", borderRadius: 12, fontSize: 12, color: "var(--charcoal)" }}>
                    ⚠️ <strong>Внимание:</strong> Слово «{duplicateAddWord.en}» с этой частью речи ({allPos[duplicateAddWord.partOfSpeech] || duplicateAddWord.partOfSpeech}) уже есть в вашем словаре!
                    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                      <div>• Перевод: <strong>{duplicateAddWord.ru}</strong></div>
                      <div>• Часть речи: <strong>{allPos[duplicateAddWord.partOfSpeech] || duplicateAddWord.partOfSpeech}</strong></div>
                      <div>• Тема: <strong>{allTopics[duplicateAddWord.topic] || duplicateAddWord.topic}</strong></div>
                      <div>• Категория: <strong>{getCatName(duplicateAddWord.categoryId)}</strong></div>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, fontStyle: "italic", color: "var(--terracotta)" }}>
                      💡 Чтобы добавить это слово, выберите другую часть речи.
                    </div>
                  </div>
                )}

                {addMsg && (
                  <div style={{ padding: "8px 10px", background: addMsg.includes("⚠️") ? "rgba(225,29,72,0.12)" : "rgba(143,160,128,0.15)", border: addMsg.includes("⚠️") ? "1px solid var(--rose)" : "1px solid var(--sage)", borderRadius: 8, fontSize: 12, color: addMsg.includes("⚠️") ? "var(--rose)" : "var(--sage)", fontWeight: 600 }}>
                    {addMsg}
                  </div>
                )}

                {subCatsForCurrentView.length > 0 && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--charcoal)", display: "block", marginBottom: 4 }}>
                      Выберите подкатегорию <span style={{ color: "var(--rose)" }}>*</span>
                    </label>
                    <select 
                      className="input" 
                      value={addSelectedSubCatId} 
                      onChange={e => {
                        setAddSelectedSubCatId(e.target.value);
                        if (e.target.value) setAddMsg("");
                      }}
                      style={{ border: !addSelectedSubCatId ? "2px solid var(--rose)" : "1px solid var(--border)", fontWeight: 600 }}
                    >
                      <option value="">-- Выберите подкатегорию --</option>
                      {subCatsForCurrentView.map(sub => (
                        <option key={sub.id} value={sub.id}>
                          {sub.icon || "📖"} {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                      Английское слово
                    </label>
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ fontSize: 11, padding: "3px 8px", background: "rgba(143,160,128,0.15)", color: "var(--sage)" }}
                      disabled={isClassifyingAdd || !addEn.trim()}
                      onClick={handleAutoClassifyAddWord}
                    >
                      {isClassifyingAdd ? "🤖 Анализ..." : "✨ Автозаполнение ИИ"}
                    </button>
                  </div>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="например, friend"
                    value={addEn} 
                    onChange={e => setAddEn(e.target.value)}
                    onBlur={() => {
                      if (addEn.trim() && (!addRu.trim() || addTopic === "general")) {
                        handleAutoClassifyAddWord();
                      }
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    Русский перевод
                  </label>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="например, друг"
                    value={addRu} 
                    onChange={e => setAddRu(e.target.value)}
                    onBlur={() => {
                      if (addEn.trim() && addRu.trim() && addTopic === "general") {
                        handleAutoClassifyAddWord();
                      }
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    Часть речи
                  </label>
                  <select className="input" value={addPos} onChange={e => setAddPos(e.target.value)}>
                    {Object.entries(allPos).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    Тема
                  </label>
                  <select className="input" value={addTopic} onChange={e => setAddTopic(e.target.value)}>
                    {Object.entries(allTopics).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                    Заметка
                  </label>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Опционально"
                    value={addNote} 
                    onChange={e => setAddNote(e.target.value)}
                  />
                </div>
              </div>

              {/* Fixed opaque footer with buttons */}
              <div style={{ flexShrink: 0, display: "flex", gap: 8, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", background: "var(--card)" }}>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ flex: 1, padding: 10 }} 
                  disabled={!addEn.trim() || !addRu.trim() || !!duplicateAddWord || (subCatsForCurrentView.length > 0 && !addSelectedSubCatId)} 
                  onClick={handleAddWordToCurrentCat}
                >
                  Добавить слово
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: 10 }} onClick={() => setShowAddWordModal(false)}>
                  Отмена
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal: Create or Edit Category */}
      {showCatModal && (
        <div className="overlay" onClick={() => setShowCatModal(false)}>
          <div className="card overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3 className="section-title">
              {editingCatId ? "✏️ Изменить категорию" : "➕ Создать категорию"}
            </h3>

            <form onSubmit={handleSaveCategory} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Иконка
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {EMOJI_OPTIONS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      style={{
                        fontSize: 20,
                        padding: "6px 8px",
                        border: catIcon === emoji ? "2px solid var(--sage)" : "1px solid var(--border)",
                        borderRadius: 8,
                        background: catIcon === emoji ? "rgba(143,160,128,0.2)" : "var(--sand-light)",
                        cursor: "pointer"
                      }}
                      onClick={() => setCatIcon(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Название категории (например: 1 серия, Урок 1)
                </label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Введите название..." 
                  value={catName} 
                  onChange={e => setCatName(e.target.value)}
                  required 
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>
                  Родительская категория (папка)
                </label>
                <select 
                  className="input" 
                  value={catParentId || ""} 
                  onChange={e => setCatParentId(e.target.value ? e.target.value : null)}
                >
                  <option value="">(Главная категория / Без родителя)</option>
                  {categories.filter(c => !c.parentId && c.id !== editingCatId).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: 10 }}>
                  Сохранить
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: 10 }} onClick={() => setShowCatModal(false)}>
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: AI Import Words into Category */}
      {importCatId && (() => {
        const subCatsForImport = categories.filter(c => c.parentId === importCatId && !c.archived);
        const currentImportCat = categories.find(c => c.id === importCatId);
        return (
          <div className="overlay" onClick={() => setImportCatId(null)} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
            <div 
              className="card overlay-card" 
              onClick={e => e.stopPropagation()} 
              style={{ 
                maxWidth: 520, 
                width: "100%", 
                maxHeight: "88vh", 
                display: "flex", 
                flexDirection: "column", 
                padding: "20px", 
                background: "var(--card)", 
                overflow: "hidden" 
              }}
            >
              <h3 className="section-title" style={{ flexShrink: 0, margin: 0 }}>
                📥 Импорт слов в «{currentImportCat?.name}»
              </h3>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, flexShrink: 0 }}>
                Пишите сначала слово на английском, затем дефис («-») и перевод на русском (например: <strong>apple - яблоко</strong>). ИИ автоматически подберет тему и часть речи!
              </p>

              {subCatsForImport.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: "rgba(143,160,128,0.1)", borderRadius: 8, flexShrink: 0 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--charcoal)", display: "block", marginBottom: 4 }}>
                    🎯 У этой категории есть подкатегории. Выберите, куда импортировать слова:
                  </label>
                  <select 
                    className="input" 
                    value={importTargetSubId || subCatsForImport[0].id} 
                    onChange={e => setImportTargetSubId(e.target.value)}
                    style={{ width: "100%", fontSize: 13, fontWeight: 600, padding: "8px 10px" }}
                  >
                    {subCatsForImport.map(sc => (
                      <option key={sc.id} value={sc.id}>
                        {sc.icon || "📖"} {sc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {importMsg && (
                <div style={{ padding: "8px 12px", background: "rgba(143,160,128,0.15)", borderRadius: 8, fontSize: 13, color: "var(--sage)", marginTop: 8, flexShrink: 0 }}>
                  {importMsg}
                </div>
              )}

              {parsedImport.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, flex: 1, minHeight: 0 }}>
                  <textarea 
                    className="input" 
                    rows={6} 
                    placeholder={`Вставьте слова, например:\nmust - туман\nthrough - сквозь\nreveal - раскрывать и показывать\nwell-known - известный`}
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    style={{ width: "100%", flex: 1, minHeight: 120, resize: "vertical" }}
                  />

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto", paddingTop: 8, flexShrink: 0 }}>
                    <button 
                      className="btn btn-primary" 
                      style={{ flex: 1, padding: 12, minWidth: 140, fontWeight: 700 }} 
                      disabled={importing || !importText.trim()}
                      onClick={handleRunAiImport}
                    >
                      {importing ? "🤖 Распознаю слова..." : "✨ Автозаполнение ИИ"}
                    </button>

                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: 12 }}
                      onClick={() => setImportCatId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, marginTop: 12, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--charcoal)" }}>
                      💡 Проверьте и отредактируйте слова ({parsedImport.length}):
                    </span>
                    <button 
                      type="button"
                      className="btn btn-secondary" 
                      style={{ fontSize: 11, padding: "4px 8px" }}
                      onClick={() => {
                        setParsedImport([...parsedImport, { en: "", ru: "", pos: "noun", topic: "general", note: "" }]);
                      }}
                    >
                      ➕ Добавить строку
                    </button>
                  </div>

                  <div 
                    className="styled-scrollbar-y" 
                    style={{ 
                      flex: 1, 
                      overflowY: "auto", 
                      display: "flex", 
                      flexDirection: "column", 
                      gap: 10, 
                      paddingRight: 6,
                      paddingBottom: 8 
                    }}
                  >
                    {parsedImport.map((p, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          padding: "10px 12px", 
                          background: "var(--sand-light)", 
                          border: "1px solid var(--border)", 
                          borderRadius: 12, 
                          display: "flex", 
                          flexDirection: "column", 
                          gap: 8 
                        }}
                      >
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", minWidth: 22 }}>
                            #{idx + 1}
                          </span>
                          <input 
                            type="text" 
                            className="input" 
                            style={{ flex: "1 1 110px", fontSize: 13, padding: "6px 8px" }}
                            placeholder="English word" 
                            value={p.en} 
                            onChange={e => {
                              const next = [...parsedImport];
                              next[idx] = { ...next[idx], en: e.target.value };
                              setParsedImport(next);
                            }}
                          />
                          <span style={{ color: "var(--muted)", fontWeight: 700 }}>—</span>
                          <input 
                            type="text" 
                            className="input" 
                            style={{ flex: "1 1 110px", fontSize: 13, padding: "6px 8px" }}
                            placeholder="Перевод" 
                            value={p.ru} 
                            onChange={e => {
                              const next = [...parsedImport];
                              next[idx] = { ...next[idx], ru: e.target.value };
                              setParsedImport(next);
                            }}
                          />
                          <button 
                            type="button" 
                            style={{ background: "none", border: "none", color: "var(--terracotta)", cursor: "pointer", fontSize: 16, padding: "2px 4px" }}
                            onClick={() => {
                              setParsedImport(parsedImport.filter((_, i) => i !== idx));
                            }}
                            title="Удалить строку"
                          >
                            🗑️
                          </button>
                        </div>

                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <select 
                            className="input" 
                            style={{ flex: "1 1 120px", fontSize: 12, padding: "5px 8px" }}
                            value={p.pos || "noun"} 
                            onChange={e => {
                              const next = [...parsedImport];
                              next[idx] = { ...next[idx], pos: e.target.value };
                              setParsedImport(next);
                            }}
                          >
                            {Object.entries(allPos).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>

                          <select 
                            className="input" 
                            style={{ flex: "1 1 120px", fontSize: 12, padding: "5px 8px" }}
                            value={p.topic || "general"} 
                            onChange={e => {
                              const next = [...parsedImport];
                              next[idx] = { ...next[idx], topic: e.target.value };
                              setParsedImport(next);
                            }}
                          >
                            {Object.entries(allTopics).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div 
                    style={{ 
                      flexShrink: 0, 
                      display: "flex", 
                      gap: 8, 
                      marginTop: 10, 
                      paddingTop: 12, 
                      borderTop: "1px solid var(--border)", 
                      background: "var(--card)" 
                    }}
                  >
                    <button 
                      className="btn btn-primary" 
                      style={{ flex: 1, padding: 12, fontWeight: 700 }} 
                      disabled={parsedImport.filter(p => p.en.trim()).length === 0}
                      onClick={handleSaveImportedWords}
                    >
                      💾 Сохранить {parsedImport.filter(p => p.en.trim()).length} слов
                    </button>
                    <button className="btn btn-secondary" style={{ padding: 12 }} onClick={() => setImportCatId(null)}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal: Delete Confirmation */}
      {deleteCatId && (
        <div className="overlay" onClick={() => setDeleteCatId(null)}>
          <div className="card overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: "95%" }}>
            {(() => {
              const targetCat = categories.find(c => c.id === deleteCatId);
              if (!targetCat) return null;

              if (targetCat.parentId) {
                // Subcategory Deletion Modal
                const parentCatObj = categories.find(c => c.id === targetCat.parentId);
                const parentName = parentCatObj ? parentCatObj.name : "Основная категория";
                const siblingSubs = categories.filter(c => c.parentId === targetCat.parentId && c.id !== targetCat.id && !c.archived);
                const wordsInSub = words.filter(w => w.categoryId === deleteCatId);

                return (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <h3 className="section-title" style={{ margin: 0, fontSize: 18 }}>
                        🗑️ Удаление подкатегории «{targetCat.name}»
                      </h3>
                      <button className="btn btn-ghost" style={{ fontSize: 16, padding: "2px 8px" }} onClick={() => setDeleteCatId(null)}>✕</button>
                    </div>

                    <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 14px 0", lineHeight: 1.4 }}>
                      В этой подкатегории находится слов: <strong>{wordsInSub.length} шт.</strong> Выберите действие:
                    </p>

                    {/* Action Options */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                      {/* Option 1: Keep words & relocate */}
                      <div 
                        onClick={() => setDeleteSubMode("keep_words")}
                        style={{
                          padding: "12px",
                          borderRadius: 12,
                          border: deleteSubMode === "keep_words" ? "2px solid var(--sage)" : "1px solid var(--border)",
                          background: deleteSubMode === "keep_words" ? "rgba(143,160,128,0.12)" : "var(--sand-light)",
                          cursor: "pointer",
                          transition: "all 0.2s ease"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, color: "var(--charcoal)" }}>
                          <input 
                            type="radio" 
                            name="del_mode" 
                            checked={deleteSubMode === "keep_words"} 
                            onChange={() => setDeleteSubMode("keep_words")} 
                            style={{ accentColor: "var(--sage)" }}
                          />
                          <span>📦 Удалить ТОЛЬКО подкатегорию (сохранить слова)</span>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0 24px", lineHeight: 1.3 }}>
                          Подкатегория удалится, а слова ({wordsInSub.length} шт.) останутся в вашем словаре и переместятся в выбранную категорию.
                        </p>

                        {/* Destination dropdown if keep_words is selected */}
                        {deleteSubMode === "keep_words" && (
                          <div style={{ marginTop: 10, marginLeft: 24 }} onClick={e => e.stopPropagation()}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--charcoal)", marginBottom: 4 }}>
                              Куда переместить слова ({wordsInSub.length} шт.):
                            </label>
                            <select 
                              className="select" 
                              style={{ width: "100%", fontSize: 13, padding: "8px 10px", borderRadius: 8 }}
                              value={deleteDestCatId}
                              onChange={e => setDeleteDestCatId(e.target.value)}
                            >
                              {siblingSubs.length > 0 ? (
                                siblingSubs.map(sub => (
                                  <option key={sub.id} value={sub.id}>
                                    🎞️ {sub.name} (Подкатегория)
                                  </option>
                                ))
                              ) : (
                                parentCatObj && (
                                  <option value={parentCatObj.id}>
                                    📁 {parentCatObj.name} (Основная категория)
                                  </option>
                                )
                              )}
                            </select>
                            {siblingSubs.length > 0 ? (
                              <p style={{ fontSize: 11, color: "var(--sage)", marginTop: 4, fontWeight: 600 }}>
                                💡 Перемещение доступно только в другую из {siblingSubs.length} подкатегорий.
                              </p>
                            ) : (
                              <p style={{ fontSize: 11, color: "var(--sage)", marginTop: 4, fontWeight: 600 }}>
                                ✓ Так как других подкатегорий нет, слова автоматически переместятся в родительскую категорию «{parentName}».
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Option 2: Delete subcategory AND all words permanently */}
                      <div 
                        onClick={() => setDeleteSubMode("all")}
                        style={{
                          padding: "12px",
                          borderRadius: 12,
                          border: deleteSubMode === "all" ? "2px solid var(--rose)" : "1px solid var(--border)",
                          background: deleteSubMode === "all" ? "rgba(220,95,95,0.08)" : "var(--sand-light)",
                          cursor: "pointer",
                          transition: "all 0.2s ease"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 14, color: "var(--rose)" }}>
                          <input 
                            type="radio" 
                            name="del_mode" 
                            checked={deleteSubMode === "all"} 
                            onChange={() => setDeleteSubMode("all")} 
                            style={{ accentColor: "var(--rose)" }}
                          />
                          <span>💥 Удалить ВСЁ: и подкатегорию, и все слова</span>
                        </div>
                        <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0 24px", lineHeight: 1.3 }}>
                          ⚠️ Все {wordsInSub.length} слов(а) из этой подкатегории будут навсегда удалены отовсюду (включая основной словарь).
                        </p>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                      <button 
                        className="btn btn-primary" 
                        style={{ 
                          flex: 1, 
                          padding: "10px 14px", 
                          background: deleteSubMode === "all" ? "var(--rose)" : "var(--sage)", 
                          color: "#ffffff", 
                          fontWeight: 700,
                          border: "none"
                        }}
                        onClick={handleConfirmDelete}
                      >
                        {deleteSubMode === "all" ? "Удалить подкатегорию и слова" : "Переместить слова и удалить"}
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        style={{ flex: 1, padding: "10px 14px" }}
                        onClick={() => setDeleteCatId(null)}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                );
              }

              // Top-level Category Deletion Modal
              const subIds = getAllSubcategoryIds(deleteCatId, categories);
              const wordsInCat = words.filter(w => w.categoryId && subIds.includes(w.categoryId));

              return (
                <div>
                  <h3 className="section-title" style={{ margin: "0 0 10px 0" }}>
                    🗑️ Удалить категорию «{targetCat.name}»?
                  </h3>
                  <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.4 }}>
                    ⚠️ <strong>Внимание!</strong> При удалении основной категории <strong>«{targetCat.name}»</strong> будут <strong>полностью удалены</strong> все её подкатегории и <strong>все находящиеся в них слова</strong> ({wordsInCat.length} шт.), в том числе из основного словаря.
                  </p>
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button 
                      className="btn btn-primary" 
                      style={{ flex: 1, padding: 10, background: "var(--rose)", color: "#ffffff", fontWeight: 700, border: "none" }}
                      onClick={handleConfirmDelete}
                    >
                      Да, удалить Всё
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ flex: 1, padding: 10 }}
                      onClick={() => setDeleteCatId(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal: Bulk Main Categories Delete Confirmation */}
      {showBulkDeleteMainCatsConfirm && (
        <div className="overlay" onClick={() => setShowBulkDeleteMainCatsConfirm(false)}>
          <div className="card overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, width: "95%" }}>
            <h3 className="section-title" style={{ margin: "0 0 10px 0", color: "var(--charcoal)" }}>
              🗑️ Удалить выбранные категории?
            </h3>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.4, margin: "0 0 16px 0" }}>
              Вы действительно хотите удалить <strong>{selectedMainCatIds.size}</strong> категорий? Все подкатегории и слова в них также удалятся.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, padding: "10px 14px", background: "var(--rose)", color: "#fff", fontWeight: 700, border: "none" }}
                onClick={handleConfirmBulkDeleteMainCats}
              >
                Удалить
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1, padding: "10px 14px" }}
                onClick={() => setShowBulkDeleteMainCatsConfirm(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bulk Subcategories Delete Confirmation */}
      {showBulkDeleteSubCatsConfirm && (
        <div className="overlay" onClick={() => setShowBulkDeleteSubCatsConfirm(false)}>
          <div className="card overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, width: "95%" }}>
            <h3 className="section-title" style={{ margin: "0 0 10px 0", color: "var(--charcoal)" }}>
              🗑️ Удалить выбранные подкатегории?
            </h3>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.4, margin: "0 0 16px 0" }}>
              Вы действительно хотите удалить <strong>{selectedSubCatIds.size}</strong> подкатегорий? Все слова в них также удалятся.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, padding: "10px 14px", background: "var(--rose)", color: "#fff", fontWeight: 700, border: "none" }}
                onClick={handleConfirmBulkDeleteSubCats}
              >
                Удалить
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1, padding: "10px 14px" }}
                onClick={() => setShowBulkDeleteSubCatsConfirm(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Select/Transfer Words From Dictionary into Category */}
      {showSelectFromDictModal && viewCatId && currentViewCategory && (
        <div className="overlay" onClick={() => setShowSelectFromDictModal(false)}>
          <div className="card overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: "95%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <h3 className="section-title">
                {currentViewCategory.parentId 
                  ? `📥 Перенос слов из подкатегорий («${getCatName(currentViewCategory.parentId)}»)` 
                  : "📥 Выбрать слова из словаря"}
              </h3>
              <button 
                type="button" 
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--muted)" }}
                onClick={() => setShowSelectFromDictModal(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
              {currentViewCategory.parentId ? (
                <>
                  Показаны слова из основной категории <strong>«{getCatName(currentViewCategory.parentId)}»</strong> и её других подкатегорий. Выберите слова для переноса в <strong>«{currentViewCategory.name}»</strong>:
                </>
              ) : subCatsForCurrentView.length > 0 ? (
                <>
                  У категории <strong>«{currentViewCategory.name}»</strong> есть подкатегории. Выберите нужную подкатегорию ниже для перенесения отмеченных слов:
                </>
              ) : (
                <>
                  Отметьте галочками слова из основного словаря, чтобы перенести их в категорию <strong>«{currentViewCategory.name}»</strong>.
                </>
              )}
            </p>

            {/* Target Subcategory Select if current view has subcategories */}
            {!currentViewCategory.parentId && subCatsForCurrentView.length > 0 && (
              <div style={{ marginBottom: 12, padding: "10px 12px", background: "var(--sand-light)", borderRadius: 10, border: "1px solid var(--border)" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--charcoal)", display: "block", marginBottom: 6 }}>
                  🎯 Выберите подкатегорию для перераспределения слов:
                </label>
                <select 
                  className="select" 
                  style={{ width: "100%", fontSize: 13, marginBottom: 0 }}
                  value={targetSubCatId || subCatsForCurrentView[0]?.id}
                  onChange={e => setTargetSubCatId(e.target.value)}
                >
                  {subCatsForCurrentView.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.icon || "📖"} {sub.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Filter controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input 
                type="text" 
                className="input" 
                placeholder="🔍 Поиск слова по названию или переводу..." 
                value={selectDictSearch}
                onChange={e => {
                  setSelectDictSearch(e.target.value);
                  setSelectDictLimit(40);
                }}
                style={{ fontSize: 13 }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--charcoal)" }}>
                  Выбрано: <strong style={{ color: "var(--sage)" }}>{selectDictSelectedIds.size}</strong> из {candidateWordsForSelect.length}
                </span>

                <div style={{ display: "flex", gap: 6 }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ fontSize: 11, padding: "4px 8px" }}
                    onClick={() => {
                      const allIds = candidateWordsForSelect.map(w => w.id);
                      setSelectDictSelectedIds(new Set(allIds));
                    }}
                  >
                    ☑️ Выбрать все
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ fontSize: 11, padding: "4px 8px" }}
                    onClick={() => setSelectDictSelectedIds(new Set())}
                  >
                    ⬜ Снять выбор
                  </button>
                </div>
              </div>
            </div>

            {/* Warning if any selected words are already in this subcategory */}
            {Array.from(selectDictSelectedIds).some(id => words.find(w => w.id === id)?.categoryId === viewCatId) && (
              <div style={{ padding: "10px 12px", background: "rgba(245, 158, 11, 0.15)", border: "1px solid #f59e0b", borderRadius: 12, fontSize: 12, color: "var(--charcoal)", marginTop: 8 }}>
                ⚠️ <strong>Уведомление:</strong> Некоторые из выбранных слов уже находятся в этой категории!
              </div>
            )}

            {/* Candidate Words List */}
            <div style={{ maxHeight: 320, overflowY: "auto", marginTop: 10, display: "flex", flexDirection: "column", gap: 6, paddingRight: 4 }}>
              {candidateWordsForSelect.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 10px", color: "var(--muted)", fontSize: 13, background: "var(--sand-light)", borderRadius: 10 }}>
                  {currentViewCategory.parentId ? "В этой категории пока нет подходящих слов для перераспределения." : "Слова не найдены."}
                </div>
              ) : (
                <>
                  {visibleCandidates.map(w => {
                    const isChecked = selectDictSelectedIds.has(w.id);
                    const isAlreadyInCat = w.categoryId === viewCatId;

                    return (
                      <label 
                        key={w.id} 
                        style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: 10, 
                          padding: "8px 12px", 
                          background: isChecked ? "rgba(143,160,128,0.2)" : isAlreadyInCat ? "rgba(254,243,199,0.12)" : "var(--sand-light)", 
                          border: isChecked ? "1px solid var(--sage)" : isAlreadyInCat ? "1px solid #f59e0b" : "1px solid var(--border)", 
                          borderRadius: 10, 
                          cursor: "pointer",
                          transition: "all 0.15s ease"
                        }}
                      >
                        <input 
                          type="checkbox" 
                          checked={isChecked} 
                          onChange={() => {
                            const next = new Set(selectDictSelectedIds);
                            if (next.has(w.id)) {
                              next.delete(w.id);
                            } else {
                              next.add(w.id);
                            }
                            setSelectDictSelectedIds(next);
                          }}
                          style={{ width: 16, height: 16, accentColor: "var(--sage)" }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--charcoal)" }}>{w.en}</span>
                            <span style={{ fontSize: 12, color: "var(--terracotta)", fontWeight: 500 }}>➔ {w.ru}</span>
                            {isAlreadyInCat && (
                              <span style={{ fontSize: 11, color: "var(--charcoal)", background: "rgba(245, 158, 11, 0.2)", padding: "1px 6px", borderRadius: 6, fontWeight: 600 }}>
                                ⚠️ Слово уже присутствует в этой подкатегории
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
                            <span className="badge badge-gray" style={{ fontSize: 10, padding: "1px 5px" }}>
                              📁 {getCatName(w.categoryId)}
                            </span>
                            <span className="badge badge-gray" style={{ fontSize: 10, padding: "1px 5px" }}>
                              🏷️ {allPos[w.partOfSpeech] || w.partOfSpeech}
                            </span>
                            <span className="badge badge-gray" style={{ fontSize: 10, padding: "1px 5px" }}>
                              🌐 {allTopics[w.topic] || w.topic}
                            </span>
                          </div>
                        </div>
                      </label>
                    );
                  })}

                  {candidateWordsForSelect.length > selectDictLimit && (
                    <button 
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ fontSize: 12, width: "100%", padding: "8px", marginTop: 6 }}
                      onClick={() => setSelectDictLimit(prev => prev + 50)}
                    >
                      Показать еще ({candidateWordsForSelect.length - selectDictLimit})...
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button 
                type="button"
                className="btn btn-primary" 
                style={{ flex: 1, padding: 12 }} 
                disabled={selectDictSelectedIds.size === 0}
                onClick={handleTransferSelectedWords}
              >
                💾 Перенести выбранное ({selectDictSelectedIds.size})
              </button>
              <button 
                type="button"
                className="btn btn-secondary" 
                style={{ padding: 12 }} 
                onClick={() => setShowSelectFromDictModal(false)}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Word Permanent Deletion */}
      {wordToDeleteConfirm && (
        <div className="overlay" onClick={() => setWordToDeleteConfirm(null)}>
          <div className="card overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ textAlign: "center", padding: "10px 4px" }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>⚠️</div>
              <h3 className="section-title" style={{ fontSize: 18, color: "var(--rose)", marginBottom: 8 }}>
                Удалить слово навсегда?
              </h3>
              <p style={{ fontSize: 14, color: "var(--charcoal)", marginBottom: 8, lineHeight: 1.4 }}>
                Вы уверены, что хотите удалить слово <strong>«{wordToDeleteConfirm.en}»</strong> (<em>{wordToDeleteConfirm.ru}</em>)?
              </p>
              <div style={{ fontSize: 12, color: "var(--rose)", fontWeight: 600, background: "rgba(220,95,95,0.08)", border: "1px solid rgba(220,95,95,0.2)", padding: "10px 12px", borderRadius: 10, textAlign: "left", lineHeight: 1.4, marginBottom: 16 }}>
                ❗ <strong>Обратите внимание:</strong> Слово будет полностью и навсегда удалено из основного словаря и из всех категорий/подкатегорий.
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1, padding: "10px" }}
                  onClick={() => setWordToDeleteConfirm(null)}
                >
                  Отмена
                </button>
                <button 
                  type="button" 
                  className="btn" 
                  style={{ flex: 1, padding: "10px", background: "var(--rose)", color: "#fff", fontWeight: 700, borderRadius: 30 }}
                  onClick={() => {
                    handleDeleteWordFromCat(wordToDeleteConfirm.id);
                    setWordToDeleteConfirm(null);
                  }}
                >
                  🗑️ Удалить навсегда
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Transfer Words into Current Category / Subcategory */}
      {showTransferWordsModal && currentMainCategory && (
        <div className="overlay" onClick={() => setShowTransferWordsModal(false)}>
          <div className="card overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 540, width: "95%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <h3 className="section-title" style={{ margin: 0, fontSize: 18 }}>
                {selectedSubCatId && currentSubCategory 
                  ? `🔀 Перенести слова в «${currentSubCategory.name}»` 
                  : `🔀 Перенести слова в «${currentMainCategory.name}»`}
              </h3>
              <button 
                type="button" 
                style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--muted)" }}
                onClick={() => setShowTransferWordsModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Description */}
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, lineHeight: 1.4 }}>
              {selectedSubCatId && currentSubCategory ? (
                <>
                  Выберите слова из других имеющихся подкатегорий этой категории для перемещения в подкатегорию <strong>«{currentSubCategory.name}»</strong>:
                </>
              ) : subcategoriesForMainCat.length > 0 ? (
                <>
                  Выберите слова из других категорий и укажите, в какую именно подкатегорию категории <strong>«{currentMainCategory.name}»</strong> их поместить:
                </>
              ) : (
                <>
                  Выберите слова из других категорий для перемещения в <strong>«{currentMainCategory.name}»</strong>:
                </>
              )}
            </p>

            {/* If Level 2 (Main Category) AND has subcategories -> Mandatory Target Subcategory Select */}
            {!selectedSubCatId && subcategoriesForMainCat.length > 0 && (
              <div style={{ marginBottom: 12, padding: "10px 14px", background: "var(--sand-light)", borderRadius: 12, border: "1px solid var(--border)" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--charcoal)", display: "block", marginBottom: 6 }}>
                  🎯 Выберите подкатегорию, куда перенести слова:
                </label>
                <select 
                  className="input" 
                  style={{ width: "100%", fontSize: 13, marginBottom: 0, borderRadius: 20 }}
                  value={transferTargetSubId || (subcategoriesForMainCat[0] ? subcategoriesForMainCat[0].id : "")}
                  onChange={e => setTransferTargetSubId(e.target.value)}
                >
                  {subcategoriesForMainCat.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.icon || "📁"} {sub.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Filter controls: Source category selector & Search input */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {/* Source Filter Select */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>Из категории:</span>
                <select 
                  className="input" 
                  style={{ width: "100%", fontSize: 12, borderRadius: 20, padding: "6px 12px" }}
                  value={transferSourceCatFilter}
                  onChange={e => setTransferSourceCatFilter(e.target.value)}
                >
                  {selectedSubCatId ? (
                    <>
                      <option value="all">🌐 Все имеющиеся подкатегории</option>
                      {categories
                        .filter(c => c.parentId === currentMainCategory.id && c.id !== selectedSubCatId && !c.archived)
                        .map(sub => (
                          <option key={sub.id} value={sub.id}>📁 {sub.name}</option>
                        ))}
                      <option value={currentMainCategory.id}>📂 Из корня этой категории</option>
                    </>
                  ) : (
                    <>
                      <option value="all">🌐 Все другие категории</option>
                      {topCategories
                        .filter(c => c.id !== selectedMainCatId)
                        .map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.icon || "📁"} {cat.name}</option>
                        ))}
                    </>
                  )}
                </select>
              </div>

              {/* Search bar */}
              <input 
                type="text" 
                className="input" 
                placeholder="🔍 Поиск слова по названию или переводу..." 
                value={transferSearch}
                onChange={e => setTransferSearch(e.target.value)}
                style={{ fontSize: 13, borderRadius: 20 }}
              />

              {/* Counts and select all/none buttons */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--charcoal)" }}>
                  Отмечено: <strong style={{ color: "var(--sage)" }}>{transferSelectedIds.size}</strong> из {candidateWordsForTransfer.length}
                </span>

                <div style={{ display: "flex", gap: 6 }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20 }}
                    onClick={() => {
                      const allIds = candidateWordsForTransfer.map(w => w.id);
                      setTransferSelectedIds(new Set(allIds));
                    }}
                  >
                    ☑️ Выбрать все
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20 }}
                    onClick={() => setTransferSelectedIds(new Set())}
                  >
                    ⬜ Снять выбор
                  </button>
                </div>
              </div>
            </div>

            {/* Candidate Words List */}
            <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 4, marginBottom: 14 }}>
              {candidateWordsForTransfer.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 10px", color: "var(--muted)", fontSize: 13, background: "var(--sand-light)", borderRadius: 12 }}>
                  Подходящие слова не найдены.
                </div>
              ) : (
                candidateWordsForTransfer.slice(0, 100).map(w => {
                  const isChecked = transferSelectedIds.has(w.id);
                  const sourceCatObj = categories.find(c => c.id === w.categoryId);
                  const sourceName = sourceCatObj ? sourceCatObj.name : "Базовый словарь";

                  return (
                    <label 
                      key={w.id} 
                      style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        justifyContent: "space-between", 
                        padding: "8px 12px", 
                        background: isChecked ? "rgba(143,160,128,0.12)" : "var(--sand-light)", 
                        border: isChecked ? "1px solid var(--sage)" : "1px solid var(--border)", 
                        borderRadius: 12, 
                        cursor: "pointer",
                        transition: "background 0.15s ease"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input 
                          type="checkbox" 
                          checked={isChecked} 
                          onChange={() => {
                            const next = new Set(transferSelectedIds);
                            if (next.has(w.id)) next.delete(w.id);
                            else next.add(w.id);
                            setTransferSelectedIds(next);
                          }}
                          style={{ width: 16, height: 16, accentColor: "var(--sage)" }}
                        />
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--charcoal)" }}>{w.en}</span>
                          <span style={{ fontSize: 13, color: "var(--terracotta)", marginLeft: 8, fontWeight: 600 }}>➔ {w.ru}</span>
                        </div>
                      </div>

                      <span className="badge badge-gray" style={{ fontSize: 10 }}>
                        {sourceName}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowTransferWordsModal(false)}
                style={{ fontSize: 13, borderRadius: 20, padding: "8px 16px" }}
              >
                Отмена
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                disabled={transferSelectedIds.size === 0}
                onClick={handleExecuteTransferWords}
                style={{ fontSize: 13, borderRadius: 20, padding: "8px 20px", fontWeight: 700 }}
              >
                🔀 Перенести ({transferSelectedIds.size})
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Confirm Bulk Words Deletion in Category */}
      {showBulkDeleteWordsConfirm && (
        <div className="overlay" onClick={() => setShowBulkDeleteWordsConfirm(false)}>
          <div className="card overlay-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div style={{ textAlign: "center", padding: "10px 4px" }}>
              <div style={{ fontSize: 38, marginBottom: 8 }}>🗑️</div>
              <h3 className="section-title" style={{ fontSize: 18, color: "var(--terracotta)", marginBottom: 8 }}>
                Удалить выбранные слова ({selectedWordIds.size})?
              </h3>
              <p style={{ fontSize: 14, color: "var(--charcoal)", marginBottom: 8, lineHeight: 1.4 }}>
                Вы уверены, что хотите безвозвратно удалить <strong>{selectedWordIds.size}</strong> выбранных слов из этой категории?
              </p>
              <div style={{ fontSize: 12, color: "var(--terracotta)", fontWeight: 600, background: "rgba(188,71,73,0.08)", border: "1px solid rgba(188,71,73,0.2)", padding: "10px 12px", borderRadius: 10, textAlign: "left", lineHeight: 1.4, marginBottom: 16 }}>
                ❗ <strong>Обратите внимание:</strong> Все выбранные слова будут полностью и навсегда удалены из словаря. Это действие нельзя отменить!
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1, padding: "10px" }}
                  onClick={() => setShowBulkDeleteWordsConfirm(false)}
                >
                  Отмена
                </button>
                <button 
                  type="button" 
                  className="btn" 
                  style={{ flex: 1, padding: "10px", background: "var(--terracotta)", color: "#fff", fontWeight: 700, borderRadius: 30 }}
                  onClick={() => {
                    const ids = Array.from(selectedWordIds) as string[];
                    const count = ids.length;
                    if (onDeleteWords) {
                      onDeleteWords(ids);
                    } else if (onDeleteWord) {
                      ids.forEach(id => onDeleteWord(id));
                    }
                    setSelectedWordIds(new Set());
                    setShowBulkDeleteWordsConfirm(false);
                    showToast(`🗑️ Удалено слов: ${count}`);
                  }}
                >
                  🗑️ Удалить ({selectedWordIds.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
