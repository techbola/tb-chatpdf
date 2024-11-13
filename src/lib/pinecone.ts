import { Pinecone, Vector } from "@pinecone-database/pinecone";
import { downloadFromS3 } from "./s3-server";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import md5 from "md5";
import {
  Document,
  RecursiveCharacterTextSplitter,
} from "@pinecone-database/doc-splitter";
import { getEmbeddings } from "./embeddings";
import { convertToAscii } from "./utils";

// Define the base Vector type
interface Vector {
  id: string;
  values: number[];
  metadata?: {
    [key: string]: string | number | boolean;
  };
}

// Define specific fields for metadata
interface CustomMetadata {
  text: string;
  pageNumber: number;
}

// Define CustomVector with flexible metadata
interface CustomVector extends Vector {
  metadata: CustomMetadata & {
    [key: string]: string | number | boolean; // Allows other fields as well
  };
}

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const pineconeIndex = pc.Index("pdf-chats");

type PDFPage = {
  pageContent: string;
  metadata: {
    loc: { pageNumber: number };
  };
};

export async function loadS3IntoPineCone(fileKey: string) {
  try {
    // Obtain the pdf - download and read from pdf
    const file_name = await downloadFromS3(fileKey);

    if (!file_name) {
      throw new Error("Could not download from S3");
    }

    const loader = new PDFLoader(file_name);
    const pages = (await loader.load()) as PDFPage[];

    // Split and segment the pdf into chunks
    const documents = await Promise.all(pages.map(prepareDocument));

    // vectorise and embed individual documents
    const vectors: CustomVector[] = await Promise.all(
      documents.flat().map(embedDocument)
    );

    // upload to pinecone
    const namespace = convertToAscii(fileKey);
    // Use the custom chunkedUpsert function
    await chunkedUpsert(pineconeIndex, namespace, vectors, 10);

    console.log("inserting vectors into pinecone");

    return documents[0];
  } catch (error) {
    console.error("Error in loadS3IntoPineCone:", error);
    throw new Error("Failed to load PDF into Pinecone");
  }
}

async function chunkedUpsert(
  index: ReturnType<typeof pc.Index>,
  namespace: string,
  vectors: CustomVector[],
  chunkSize: number = 10
) {
  for (let i = 0; i < vectors.length; i += chunkSize) {
    const chunk = vectors.slice(i, i + chunkSize);
    try {
      await index.namespace(namespace).upsert(chunk);
      console.log(`Successfully upserted chunk starting at index ${i}`);
    } catch (error) {
      console.error(`Error upserting chunk starting at index ${i}:`, error);
      throw error; // Stop execution on failure, or handle as needed
    }
  }
}

async function embedDocument(doc: Document): Promise<CustomVector> {
  try {
    const embeddings = await getEmbeddings(doc.pageContent);
    const hash = md5(doc.pageContent);

    return {
      id: hash,
      values: embeddings,
      metadata: {
        text: doc.metadata.text as string,
        pageNumber: doc.metadata.pageNumber as number,
      },
    };
  } catch (error) {
    console.log("error embedding documnet", error);
    throw error;
  }
}

// truncate the string
export const truncateStringByBytes = (str: string, bytes: number) => {
  const encoder = new TextEncoder();
  return new TextDecoder("utf-8").decode(encoder.encode(str).slice(0, bytes));
};

// prepare the document (takes a page and splits it into chunks (documents))
async function prepareDocument(page: PDFPage) {
  let { pageContent, metadata } = page;
  pageContent = pageContent.replace(/\n/g, "");
  // split the docs
  const splitter = new RecursiveCharacterTextSplitter();
  const docs = await splitter.splitDocuments([
    new Document({
      pageContent,
      metadata: {
        pageNumber: metadata.loc.pageNumber,
        text: truncateStringByBytes(pageContent, 36000),
      },
    }),
  ]);
  return docs;
}
