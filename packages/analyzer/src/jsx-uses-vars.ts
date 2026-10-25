import type { Rule } from 'eslint';

interface JSXName {
  type: string;
  name?: string;
  object?: JSXName;
}

// Les composants JSX sont des references de variables, pas des variables inutilisees.
// Cette aide interne ne produit aucun diagnostic et ne transforme jamais le code.
export const jsxUsesVars: Rule.RuleModule = {
  meta: { type: 'problem', schema: [], messages: {} },
  create(context) {
    return {
      JSXOpeningElement(node: Rule.Node) {
        let name: JSXName | undefined = (node as unknown as { name: JSXName }).name;
        let member = false;
        while (name?.type === 'JSXMemberExpression') {
          member = true;
          name = name.object;
        }
        if (name?.type === 'JSXIdentifier' && name.name && (member || /^[A-Z]/.test(name.name))) {
          context.sourceCode.markVariableAsUsed(name.name, node);
        }
      },
    };
  },
};
